import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  STEP 61 — نحاكي @netlify/database ونلتقط نصّ SQL وقيمه، فنثبت: الرمز الخام
  لا يُخزَّن أبداً (SHA-256 فقط)، والاستهلاك لمرة واحدة وبقيد الصلاحية داخل
  الجملة نفسها (بلا فحص ثم تحديث منفصلين)، وفكّ الربط محصور بالحلقة.
*/
type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
let nextRows: Record<string, unknown>[] = [];
let nextError: unknown = null;

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("?"), values });
      if (nextError) throw nextError;
      return nextRows;
    },
  }),
}));

const {
  createParentLinkToken,
  consumeParentLinkToken,
  peekParentLinkToken,
  hashParentToken,
  unlinkParentFromStudent,
  getParentChild,
  PARENT_LINK_TOKEN_TTL_DAYS,
} = await import("./parent-db");

beforeEach(() => {
  calls.length = 0;
  nextRows = [];
  nextError = null;
});

describe("createParentLinkToken", () => {
  it("يخزّن SHA-256 للرمز فقط — الرمز الخام لا يظهر في أي قيمة مُدرَجة", async () => {
    const issued = await createParentLinkToken({ halaqahId: 4, studentId: "s1", createdBy: "teacher" });

    expect(issued).not.toBeNull();
    const stored = calls[0].values;
    expect(stored).toContain(hashParentToken(issued!.token));
    expect(stored).not.toContain(issued!.token);
    expect(calls[0].text).toContain("INSERT INTO parent_link_tokens");
    expect(stored).toEqual(expect.arrayContaining([4, "s1", "teacher"]));
  });

  it("صلاحية ٧ أيام", async () => {
    const before = Date.now();
    const issued = await createParentLinkToken({ halaqahId: 4, studentId: "s1", createdBy: "student" });
    const ttl = Date.parse(issued!.expiresAt) - before;
    expect(PARENT_LINK_TOKEN_TTL_DAYS).toBe(7);
    expect(Math.abs(ttl - 7 * 86400000)).toBeLessThan(5000);
  });

  it("طالب خارج الحلقة (خطأ FK 23503) يرجع null", async () => {
    nextError = { cause: { code: "23503" } };
    expect(await createParentLinkToken({ halaqahId: 4, studentId: "x", createdBy: "teacher" })).toBeNull();
  });

  it("أي خطأ آخر يُرمى كما هو", async () => {
    nextError = new Error("boom");
    await expect(createParentLinkToken({ halaqahId: 4, studentId: "s", createdBy: "teacher" })).rejects.toThrow("boom");
  });
});

describe("consumeParentLinkToken — لمرة واحدة وبصلاحية", () => {
  it("جملة واحدة ذرّية: تشترط used_at IS NULL وexpires_at > now() وتبحث بالتجزئة لا بالرمز", async () => {
    nextRows = [{ halaqah_id: 4, student_id: "s1" }];
    const result = await consumeParentLinkToken("raw-token", 9);

    expect(result).toEqual({ halaqahId: 4, studentId: "s1" });
    expect(calls).toHaveLength(1);
    const { text, values } = calls[0];
    expect(text).toContain("used_at IS NULL");
    expect(text).toContain("expires_at > now()");
    expect(text).toContain("INSERT INTO parent_children");
    expect(values).toContain(hashParentToken("raw-token"));
    expect(values).not.toContain("raw-token");
  });

  it("رمز مستخدَم أو منتهٍ أو غير موجود (لا صفوف) يرجع null", async () => {
    nextRows = [];
    expect(await consumeParentLinkToken("used-or-expired", 9)).toBeNull();
  });
});

describe("peekParentLinkToken", () => {
  it("يفحص الاستخدام والانتهاء ولا يستهلك الرمز", async () => {
    nextRows = [{ student_name: "أحمد", halaqah_name: "حلقة" }];
    expect(await peekParentLinkToken("t")).toEqual({ studentName: "أحمد", halaqahName: "حلقة" });
    expect(calls[0].text).toContain("used_at IS NULL");
    expect(calls[0].text).toContain("expires_at > now()");
    expect(calls[0].text).not.toContain("UPDATE");
  });
});

describe("الأبناء وفكّ الربط", () => {
  it("getParentChild يقيّد بالولي المعطى (parent_id) — ابن غيره يرجع null", async () => {
    nextRows = [];
    expect(await getParentChild(1, 4, "other")).toBeNull();
    expect(calls[0].text).toContain("pc.parent_id =");
    expect(calls[0].values).toEqual([1, 4, "other"]);
  });

  it("unlink يحذف داخل الحلقة المحدَّدة فقط", async () => {
    nextRows = [{ parent_id: 3 }];
    expect(await unlinkParentFromStudent(4, "s1", 3)).toBe(true);
    expect(calls[0].text).toContain("halaqah_id =");
    expect(calls[0].values).toEqual([4, "s1", 3]);
  });
});
