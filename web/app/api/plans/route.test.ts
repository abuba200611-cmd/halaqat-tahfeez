import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  listHalaqahPlans: vi.fn(),
  getMonthActuals: vi.fn(),
  upsertPlan: vi.fn(),
  copyPreviousPlans: vi.fn(),
}));
vi.mock("@/lib/plan-db", () => dbMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "limit" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

const { GET, PUT } = await import("./route");
const { POST: copyPost } = await import("./copy-previous/route");

const teacher = { id: 7, halaqahId: 3, role: "supervisor" };
const put = (body: unknown) =>
  new Request("http://localhost/api/plans", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const valid = { studentId: "s1", month: "1448-04", hifzPagesTarget: 10, reviewPagesTarget: 20 };

describe("GET /api/plans (STEP 63)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(teacher);
    dbMocks.listHalaqahPlans.mockResolvedValue([
      { studentId: "s1", name: "أحمد", plan: { hifzPagesTarget: 10, reviewPagesTarget: 20, hifz: null, notes: null } },
      { studentId: "s2", name: "خالد", plan: null },
    ]);
    dbMocks.getMonthActuals.mockResolvedValue({ s1: { hifzPages: 4, reviewPages: 8 } });
  });

  it("بلا جلسة: 401 ولا قراءة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/plans"))).status).toBe(401);
    expect(dbMocks.listHalaqahPlans).not.toHaveBeenCalled();
  });

  it("شهر غير صالح: 400", async () => {
    expect((await GET(new Request("http://localhost/api/plans?month=2026-10"))).status).toBe(400);
  });

  it("يقرأ حلقة الجلسة فقط ويعيد الصفوف بالإنجاز والتقدّم", async () => {
    const res = await GET(new Request("http://localhost/api/plans?month=1448-04"));
    expect(res.status).toBe(200);
    expect(dbMocks.listHalaqahPlans).toHaveBeenCalledWith(3, "1448-04");
    expect(dbMocks.getMonthActuals).toHaveBeenCalledWith(3, expect.any(String), expect.any(String));
    const body = await res.json();
    expect(body.month).toBe("1448-04");
    expect(body.prevMonth).toBe("1448-03");
    expect(body.nextMonth).toBe("1448-05");
    expect(body.rows[0].actual).toEqual({ hifzPages: 4, reviewPages: 8 });
    expect(body.rows[0].progress.hifzPct).toBe(40);
    expect(body.rows[1].plan).toBe(null);
    expect(body.rows[1].actual).toEqual({ hifzPages: 0, reviewPages: 0 });
  });
});

describe("PUT /api/plans (STEP 63)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(teacher);
    dbMocks.upsertPlan.mockResolvedValue(true);
  });

  it("بلا جلسة: 401 ولا كتابة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await PUT(put(valid))).status).toBe(401);
    expect(dbMocks.upsertPlan).not.toHaveBeenCalled();
  });

  it("مساعد يحرّر كالمشرف", async () => {
    authMocks.currentTeacher.mockResolvedValue({ ...teacher, role: "assistant" });
    expect((await PUT(put(valid))).status).toBe(200);
  });

  it("بيانات غير صالحة: 400 ولا كتابة", async () => {
    expect((await PUT(put({ ...valid, hifzPagesTarget: 9999 }))).status).toBe(400);
    expect((await PUT(put({ ...valid, month: "x" }))).status).toBe(400);
    expect(dbMocks.upsertPlan).not.toHaveBeenCalled();
  });

  it("حلقة الجلسة تُمرَّر دائماً حتى لو أرسل العميل halaqahId آخر", async () => {
    await PUT(put({ ...valid, halaqahId: 99 }));
    expect(dbMocks.upsertPlan).toHaveBeenCalledWith(3, 7, "s1", "1448-04", expect.objectContaining({ hifzPagesTarget: 10 }));
  });

  it("طالب من حلقة أخرى أو محذوف: 404", async () => {
    dbMocks.upsertPlan.mockResolvedValue(false);
    expect((await PUT(put(valid))).status).toBe(404);
  });

  it("تجاوز الحدّ: 429", async () => {
    rateMocks.checkRateLimit.mockResolvedValueOnce(false);
    expect((await PUT(put(valid))).status).toBe(429);
    expect(dbMocks.upsertPlan).not.toHaveBeenCalled();
  });
});

describe("POST /api/plans/copy-previous (STEP 63)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(teacher);
    dbMocks.copyPreviousPlans.mockResolvedValue(4);
  });
  const post = (body: unknown) =>
    new Request("http://localhost/api/plans/copy-previous", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("بلا جلسة: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await copyPost(post({ month: "1448-04" }))).status).toBe(401);
    expect(dbMocks.copyPreviousPlans).not.toHaveBeenCalled();
  });

  it("ينسخ من الشهر السابق للشهر المطلوب لحلقة الجلسة", async () => {
    const res = await copyPost(post({ month: "1448-01" }));
    expect(await res.json()).toEqual({ ok: true, copied: 4 });
    expect(dbMocks.copyPreviousPlans).toHaveBeenCalledWith(3, 7, "1447-12", "1448-01");
  });

  it("شهر غير صالح: 400", async () => {
    expect((await copyPost(post({ month: "bad" }))).status).toBe(400);
    expect(dbMocks.copyPreviousPlans).not.toHaveBeenCalled();
  });
});
