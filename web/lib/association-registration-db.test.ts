import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  طبقة بيانات طلبات تسجيل الجمعيات: نحاكي @netlify/database ونلتقط الاستعلامات.
  نثبت: تفرّد اسم المستخدم، الموافقة ذرّية (BEGIN…COMMIT واحدة بالجمعية والمدير
  والهوية والحالة والتدقيق) وidempotent (الثانية لا تنشئ ولا تكتب)، والرفض.
*/

const state = vi.hoisted(() => ({
  sqlRows: [] as Record<string, unknown>[][],
  sqlCalls: [] as { text: string; values: unknown[] }[],
  sqlError: null as unknown,
  clientCalls: [] as { text: string; params: unknown[] }[],
  request: null as Record<string, unknown> | null,
  adminExists: false,
  released: 0,
}));

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      state.sqlCalls.push({ text: strings.join("?"), values });
      if (state.sqlError && strings.join("?").includes("INSERT")) throw state.sqlError;
      return state.sqlRows.length > 0 ? (state.sqlRows.shift() as Record<string, unknown>[]) : [];
    },
    pool: {
      query: async () => ({ rows: [] }),
      connect: async () => ({
        query: async (text: string, params: unknown[] = []) => {
          state.clientCalls.push({ text, params });
          if (text.includes("FROM association_registration_requests") && text.includes("FOR UPDATE")) {
            return { rows: state.request ? [state.request] : [] };
          }
          if (text.includes("FROM association_admins")) return { rows: state.adminExists ? [{ "?column?": 1 }] : [] };
          if (text.includes("INSERT INTO associations")) return { rows: [{ id: 11 }] };
          if (text.includes("INSERT INTO association_admins")) return { rows: [{ id: 22 }] };
          return { rows: [] };
        },
        release: () => {
          state.released += 1;
        },
      }),
    },
  }),
}));

const identityMock = vi.hoisted(() => ({ ensureAssociationAdminIdentity: vi.fn(async () => {}) }));
vi.mock("@/lib/identity", () => identityMock);
vi.mock("@/lib/mosque/password", () => ({
  verifyPassword: (plain: string, stored: string) => stored === `hash:${plain}`,
  hashPassword: (plain: string) => `hash:${plain}`,
}));

const db = await import("./association-registration-db");

const INPUT = {
  associationName: "جمعية الخير",
  registrationNumber: "",
  region: "الرياض",
  applicantName: "أحمد",
  phone: "0501234567",
  email: "a@b.co",
  username: "khair",
  password: "ignored",
};

const pendingRow = (over: Record<string, unknown> = {}) => ({
  id: 5,
  association_name: "جمعية الخير",
  region: "الرياض",
  username: "khair",
  password_hash: "hash:secret123",
  status: "pending",
  ...over,
});

const texts = () => state.clientCalls.map((c) => c.text);
const wrote = (needle: string) => texts().some((t) => t.includes(needle));

beforeEach(() => {
  state.sqlRows = [];
  state.sqlCalls = [];
  state.sqlError = null;
  state.clientCalls = [];
  state.request = null;
  state.adminExists = false;
  state.released = 0;
  identityMock.ensureAssociationAdminIdentity.mockClear();
});

describe("createAssociationRegistrationRequest", () => {
  it("اسم محجوز → username_taken بلا إدراج", async () => {
    state.sqlRows = [[{ hit: 1 }]];
    expect(await db.createAssociationRegistrationRequest(INPUT, "h")).toEqual({ ok: false, code: "username_taken" });
    expect(state.sqlCalls.some((c) => c.text.includes("INSERT INTO association_registration_requests"))).toBe(false);
  });

  it("يخزّن البصمة لا كلمة المرور الخام", async () => {
    state.sqlRows = [[], [{ id: 9 }]];
    expect(await db.createAssociationRegistrationRequest(INPUT, "hash:x")).toEqual({ ok: true, id: 9 });
    const insert = state.sqlCalls.find((c) => c.text.includes("INSERT INTO association_registration_requests"));
    expect(insert?.values).toContain("hash:x");
    expect(insert?.values).not.toContain("ignored");
  });

  it("سباق 23505 → username_taken", async () => {
    state.sqlRows = [[]];
    state.sqlError = Object.assign(new Error("dup"), { code: "23505" });
    expect(await db.createAssociationRegistrationRequest(INPUT, "h")).toEqual({ ok: false, code: "username_taken" });
  });
});

describe("approveAssociationRegistrationRequest — ذرّية وidempotent", () => {
  it("جمعية + مدير بالبصمة المخزّنة + هوية + حالة + تدقيق بين BEGIN وCOMMIT", async () => {
    state.request = pendingRow();
    expect(await db.approveAssociationRegistrationRequest(5)).toEqual({ ok: true, associationId: 11, adminId: 22 });

    const t = texts();
    expect(t[0]).toBe("BEGIN");
    expect(t[t.length - 1]).toBe("COMMIT");
    expect(t).not.toContain("ROLLBACK");
    const adminInsert = state.clientCalls.find((c) => c.text.includes("INSERT INTO association_admins"));
    expect(adminInsert?.params).toEqual([11, "khair", "hash:secret123"]);
    expect(identityMock.ensureAssociationAdminIdentity).toHaveBeenCalledWith(expect.anything(), { id: 22, username: "khair" });
    expect(wrote("SET status = 'approved'")).toBe(true);
    const audit = state.clientCalls.find((c) => c.text.includes("INSERT INTO dev_audit_log"));
    expect(audit?.params[0]).toBe("association_request.approve");
    expect(state.released).toBe(1);
  });

  it("لا double-approve: المقبول سلفاً → already_decided بلا إنشاء ولا تدقيق", async () => {
    state.request = pendingRow({ status: "approved" });
    expect(await db.approveAssociationRegistrationRequest(5)).toEqual({ ok: false, code: "already_decided" });
    expect(wrote("INSERT INTO associations")).toBe(false);
    expect(wrote("INSERT INTO association_admins")).toBe(false);
    expect(wrote("dev_audit_log")).toBe(false);
    expect(texts()).toContain("ROLLBACK");
    expect(state.released).toBe(1);
  });

  it("الاستدعاء الثاني بعد نجاح الأول يتوقف", async () => {
    state.request = pendingRow();
    expect((await db.approveAssociationRegistrationRequest(5)).ok).toBe(true);
    state.clientCalls = [];
    state.request = pendingRow({ status: "approved" });
    expect(await db.approveAssociationRegistrationRequest(5)).toEqual({ ok: false, code: "already_decided" });
    expect(wrote("INSERT INTO associations")).toBe(false);
  });

  it("غير موجود → not_found؛ واسم صار لمدير قائم → username_taken بتراجع كامل", async () => {
    expect(await db.approveAssociationRegistrationRequest(404)).toEqual({ ok: false, code: "not_found" });
    state.clientCalls = [];
    state.request = pendingRow();
    state.adminExists = true;
    expect(await db.approveAssociationRegistrationRequest(5)).toEqual({ ok: false, code: "username_taken" });
    expect(wrote("INSERT INTO associations")).toBe(false);
  });

  it("فشل في المنتصف → ROLLBACK ولا COMMIT", async () => {
    state.request = pendingRow();
    identityMock.ensureAssociationAdminIdentity.mockRejectedValueOnce(new Error("identity failed"));
    await expect(db.approveAssociationRegistrationRequest(5)).rejects.toThrow("identity failed");
    expect(texts()).toContain("ROLLBACK");
    expect(texts()).not.toContain("COMMIT");
    expect(state.released).toBe(1);
  });
});

describe("rejectAssociationRegistrationRequest", () => {
  it("يحفظ السبب مع التدقيق في ترانزاكشن واحدة", async () => {
    state.request = pendingRow();
    expect(await db.rejectAssociationRegistrationRequest(5, "ترخيص غير صالح")).toEqual({ ok: true });
    const update = state.clientCalls.find((c) => c.text.includes("SET status = 'rejected'"));
    expect(update?.params).toEqual([5, "ترخيص غير صالح"]);
    expect(texts()[texts().length - 1]).toBe("COMMIT");
  });

  it("المبتوت فيه لا يُرفض ثانية", async () => {
    state.request = pendingRow({ status: "rejected" });
    expect(await db.rejectAssociationRegistrationRequest(5, "سبب")).toEqual({ ok: false, code: "already_decided" });
    expect(wrote("SET status = 'rejected'")).toBe(false);
  });
});

describe("associationLoginRequestStatus", () => {
  it("كلمة المرور الصحيحة تكشف الحالة، والخاطئة لا تكشف شيئاً", async () => {
    state.sqlRows = [[{ status: "rejected", reject_reason: "ناقص", password_hash: "hash:right" }]];
    expect(await db.associationLoginRequestStatus("khair", "right")).toEqual({ status: "rejected", reason: "ناقص" });
    state.sqlRows = [[{ status: "pending", reject_reason: null, password_hash: "hash:right" }]];
    expect(await db.associationLoginRequestStatus("khair", "wrong")).toBeNull();
  });
});
