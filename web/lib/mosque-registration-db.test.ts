import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  طبقة بيانات طلبات تسجيل الجوامع: نحاكي @netlify/database (sql + pool) ونلتقط
  الاستعلامات. نثبت: تفرّد اسم المستخدم (مدير قائم / طلب معلّق / سباق الفهرس)،
  الموافقة ذرّية وidempotent (الثانية لا تنشئ ولا تكتب)، الرفض، ومطابقة الجمعية.
*/

const state = vi.hoisted(() => ({
  sqlRows: [] as Record<string, unknown>[][],
  sqlCalls: [] as { text: string; values: unknown[] }[],
  sqlError: null as unknown,
  clientCalls: [] as { text: string; params: unknown[] }[],
  request: null as Record<string, unknown> | null,
  adminExists: false,
  assocRows: [] as Record<string, unknown>[],
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
          if (text.includes("FROM mosque_registration_requests") && text.includes("FOR UPDATE")) {
            return { rows: state.request ? [state.request] : [] };
          }
          if (text.includes("FROM mosque_admins")) return { rows: state.adminExists ? [{ "?column?": 1 }] : [] };
          if (text.includes("FROM associations")) return { rows: state.assocRows };
          if (text.includes("INSERT INTO mosques")) return { rows: [{ id: 11 }] };
          if (text.includes("INSERT INTO mosque_admins")) return { rows: [{ id: 22 }] };
          return { rows: [] };
        },
        release: () => {
          state.released += 1;
        },
      }),
    },
  }),
}));

const identityMock = vi.hoisted(() => ({ ensureMosqueAdminIdentity: vi.fn(async () => {}) }));
vi.mock("@/lib/identity", () => identityMock);
vi.mock("@/lib/mosque/password", () => ({
  verifyPassword: (plain: string, stored: string) => stored === `hash:${plain}`,
  hashPassword: (plain: string) => `hash:${plain}`,
}));

const db = await import("./mosque-registration-db");

const INPUT = {
  mosqueName: "جامع النور",
  city: "الرياض",
  applicantName: "أحمد",
  phone: "0501234567",
  email: "a@b.co",
  username: "noor",
  password: "ignored",
  associationName: "",
};

const pendingRow = (over: Record<string, unknown> = {}) => ({
  id: 5,
  mosque_name: "جامع النور",
  city: "الرياض",
  username: "noor",
  password_hash: "hash:secret123",
  association_name: "",
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
  state.assocRows = [];
  state.released = 0;
  identityMock.ensureMosqueAdminIdentity.mockClear();
});

describe("createRegistrationRequest — تفرّد اسم المستخدم", () => {
  it("اسم محجوز (مدير قائم أو طلب معلّق) → username_taken بلا إدراج", async () => {
    state.sqlRows = [[{ hit: 1 }]];
    expect(await db.createRegistrationRequest(INPUT, "h")).toEqual({ ok: false, code: "username_taken" });
    expect(state.sqlCalls.some((c) => c.text.includes("INSERT INTO mosque_registration_requests"))).toBe(false);
  });

  it("اسم حرّ → يُدرج ويرجع المعرّف مع البصمة لا كلمة المرور الخام", async () => {
    state.sqlRows = [[], [{ id: 9 }]];
    expect(await db.createRegistrationRequest(INPUT, "hash:x")).toEqual({ ok: true, id: 9 });
    const insert = state.sqlCalls.find((c) => c.text.includes("INSERT INTO mosque_registration_requests"));
    expect(insert?.values).toContain("hash:x");
    expect(insert?.values).not.toContain("ignored");
  });

  it("سباق: انتهاك الفهرس الفريد 23505 → username_taken لا 500", async () => {
    state.sqlRows = [[]];
    state.sqlError = Object.assign(new Error("dup"), { code: "23505" });
    expect(await db.createRegistrationRequest(INPUT, "h")).toEqual({ ok: false, code: "username_taken" });
  });

  it("خطأ آخر بالقاعدة يُرمى كما هو", async () => {
    state.sqlRows = [[]];
    state.sqlError = new Error("boom");
    await expect(db.createRegistrationRequest(INPUT, "h")).rejects.toThrow("boom");
  });
});

describe("approveRegistrationRequest — ذرّية وidempotent", () => {
  it("موافقة: جامع + مدير بالبصمة المخزّنة + هوية + حالة + تدقيق، كلها بين BEGIN وCOMMIT", async () => {
    state.request = pendingRow();
    const result = await db.approveRegistrationRequest(5);
    expect(result).toEqual({ ok: true, mosqueId: 11, adminId: 22, associationId: null });

    const t = texts();
    expect(t[0]).toBe("BEGIN");
    expect(t[t.length - 1]).toBe("COMMIT");
    const adminInsert = state.clientCalls.find((c) => c.text.includes("INSERT INTO mosque_admins"));
    expect(adminInsert?.params).toEqual([11, "noor", "hash:secret123"]);
    expect(identityMock.ensureMosqueAdminIdentity).toHaveBeenCalledWith(expect.anything(), { id: 22, mosqueId: 11, username: "noor" });
    expect(wrote("SET status = 'approved'")).toBe(true);
    const audit = state.clientCalls.find((c) => c.text.includes("INSERT INTO dev_audit_log"));
    expect(audit?.params[0]).toBe("mosque_request.approve");
    expect(t).not.toContain("ROLLBACK");
    expect(state.released).toBe(1);
  });

  it("لا double-approve: الطلب المقبول سلفاً → already_decided بلا أي إنشاء", async () => {
    state.request = pendingRow({ status: "approved" });
    expect(await db.approveRegistrationRequest(5)).toEqual({ ok: false, code: "already_decided" });
    expect(wrote("INSERT INTO mosques")).toBe(false);
    expect(wrote("INSERT INTO mosque_admins")).toBe(false);
    expect(wrote("dev_audit_log")).toBe(false);
    expect(texts()).toContain("ROLLBACK");
    expect(state.released).toBe(1);
  });

  it("الاستدعاء الثاني بعد نجاح الأول: يرى approved فيتوقف (اختبار تتابعي)", async () => {
    state.request = pendingRow();
    expect((await db.approveRegistrationRequest(5)).ok).toBe(true);
    state.clientCalls = [];
    state.request = pendingRow({ status: "approved" });
    expect(await db.approveRegistrationRequest(5)).toEqual({ ok: false, code: "already_decided" });
    expect(wrote("INSERT INTO mosques")).toBe(false);
  });

  it("طلب غير موجود → not_found", async () => {
    expect(await db.approveRegistrationRequest(404)).toEqual({ ok: false, code: "not_found" });
    expect(wrote("INSERT INTO mosques")).toBe(false);
  });

  it("اسم المستخدم صار لمدير قائم → username_taken وتراجع كامل", async () => {
    state.request = pendingRow();
    state.adminExists = true;
    expect(await db.approveRegistrationRequest(5)).toEqual({ ok: false, code: "username_taken" });
    expect(wrote("INSERT INTO mosques")).toBe(false);
  });

  it("فشل في منتصف الإنشاء → ROLLBACK ولا COMMIT", async () => {
    state.request = pendingRow();
    identityMock.ensureMosqueAdminIdentity.mockRejectedValueOnce(new Error("identity failed"));
    await expect(db.approveRegistrationRequest(5)).rejects.toThrow("identity failed");
    expect(texts()).toContain("ROLLBACK");
    expect(texts()).not.toContain("COMMIT");
    expect(state.released).toBe(1);
  });

  it("جمعية مطابقة بالاسم (واحدة بالضبط) تُربط تلقائياً", async () => {
    state.request = pendingRow({ association_name: "جمعية الخير" });
    state.assocRows = [{ id: 3 }];
    const result = await db.approveRegistrationRequest(5);
    expect(result).toMatchObject({ ok: true, associationId: 3 });
    const mosqueInsert = state.clientCalls.find((c) => c.text.includes("INSERT INTO mosques"));
    expect(mosqueInsert?.params[2]).toBe(3);
  });

  it("اسم جمعية يطابق أكثر من واحدة → لا ربط تلقائي", async () => {
    state.request = pendingRow({ association_name: "الخير" });
    state.assocRows = [{ id: 3 }, { id: 4 }];
    expect(await db.approveRegistrationRequest(5)).toMatchObject({ ok: true, associationId: null });
  });

  it("جمعية مختارة صراحةً تتقدّم على الاسم؛ وغير الموجودة ترفض", async () => {
    state.request = pendingRow({ association_name: "غيرها" });
    state.assocRows = [{ id: 8 }];
    expect(await db.approveRegistrationRequest(5, { associationId: 8 })).toMatchObject({ ok: true, associationId: 8 });

    state.clientCalls = [];
    state.request = pendingRow();
    state.assocRows = [];
    expect(await db.approveRegistrationRequest(5, { associationId: 99 })).toEqual({ ok: false, code: "association_not_found" });
    expect(wrote("INSERT INTO mosques")).toBe(false);
  });
});

describe("rejectRegistrationRequest", () => {
  it("رفض معلّق بسبب: يحدّث الحالة والسبب ويدوّن التدقيق", async () => {
    state.request = { status: "pending" };
    expect(await db.rejectRegistrationRequest(5, "بيانات ناقصة")).toEqual({ ok: true });
    const update = state.clientCalls.find((c) => c.text.includes("SET status = 'rejected'"));
    expect(update?.params).toEqual([5, "بيانات ناقصة"]);
    const audit = state.clientCalls.find((c) => c.text.includes("INSERT INTO dev_audit_log"));
    expect(audit?.params[0]).toBe("mosque_request.reject");
    expect(texts()[texts().length - 1]).toBe("COMMIT");
  });

  it("مبتوت فيه سلفاً → already_decided، وغير موجود → not_found", async () => {
    state.request = { status: "rejected" };
    expect(await db.rejectRegistrationRequest(5, "سبب")).toEqual({ ok: false, code: "already_decided" });
    state.request = null;
    expect(await db.rejectRegistrationRequest(5, "سبب")).toEqual({ ok: false, code: "not_found" });
    expect(wrote("SET status = 'rejected'")).toBe(false);
  });
});

describe("loginRequestStatus — رسائل دخول الطلب المعلّق/المرفوض", () => {
  it("معلّق وكلمة المرور صحيحة → pending", async () => {
    state.sqlRows = [[{ status: "pending", reject_reason: null, password_hash: "hash:pw12345678" }]];
    expect(await db.loginRequestStatus("noor", "pw12345678")).toEqual({ status: "pending", reason: null });
  });

  it("مرفوض → يرجع السبب", async () => {
    state.sqlRows = [[{ status: "rejected", reject_reason: "بيانات ناقصة", password_hash: "hash:pw12345678" }]];
    expect(await db.loginRequestStatus("noor", "pw12345678")).toEqual({ status: "rejected", reason: "بيانات ناقصة" });
  });

  it("كلمة مرور خاطئة أو لا طلب → null (لا تسريب لحالة الطلب)", async () => {
    state.sqlRows = [[{ status: "pending", reject_reason: null, password_hash: "hash:pw12345678" }]];
    expect(await db.loginRequestStatus("noor", "wrong")).toBeNull();
    state.sqlRows = [[]];
    expect(await db.loginRequestStatus("ghost", "pw12345678")).toBeNull();
  });
});
