import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B3 — PATCH /api/wards/track: المعلّم يعيد تصنيف مقاطع مراجعة ورد قائم.
  القواعد: جلسة معلّم فقط، وورد حلقة أخرى = 404 متطابقاً مع غير الموجود،
  والورد المقفول (بعد قرار) = 403، وعدد التصنيفات ≠ عدد المقاطع = 400.
*/

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "غير مصرّح" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ setWardReviewTracks: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

const errorLogMocks = vi.hoisted(() => ({ logServerError: vi.fn(async () => {}) }));
vi.mock("@/lib/dev-error-log", () => errorLogMocks);

const { PATCH } = await import("./route");

const req = (body: unknown) =>
  new Request("http://localhost/api/wards/track", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const TEACHER = { id: 2, halaqahId: 1 };

describe("PATCH /api/wards/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(TEACHER);
  });

  it("بلا جلسة معلّم: 401 ولا كتابة إطلاقاً", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    const res = await PATCH(req({ id: 5, tracks: ["sabqi"] }));
    expect(res.status).toBe(401);
    expect(dbMocks.setWardReviewTracks).not.toHaveBeenCalled();
  });

  it("معرّف ورد مفقود أو غير رقمي: 400", async () => {
    expect((await PATCH(req({ tracks: ["sabqi"] }))).status).toBe(400);
    expect((await PATCH(req({ id: "abc", tracks: ["sabqi"] }))).status).toBe(400);
  });

  it("قيمة تصنيف خارج الكبرى/الصغرى: 400 برسالة الخادم", async () => {
    const res = await PATCH(req({ id: 5, tracks: ["قديم"] }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("للمقطع 1");
  });

  it("قائمة التصنيفات غائمة كلياً: 400", async () => {
    expect((await PATCH(req({ id: 5 }))).status).toBe(400);
  });

  it("ورد حلقة أخرى أو غير موجود: 404", async () => {
    dbMocks.setWardReviewTracks.mockResolvedValue("not_found");
    const res = await PATCH(req({ id: 5, tracks: ["sabqi", null] }));
    expect(res.status).toBe(404);
    expect(dbMocks.setWardReviewTracks).toHaveBeenCalledWith(1, 5, ["sabqi", null]);
  });

  it("ورد اكتمل قراره (اعتماد/إعادة): 403 — التصنيف جزء من المحتوى قبل القرار", async () => {
    dbMocks.setWardReviewTracks.mockResolvedValue("locked");
    const res = await PATCH(req({ id: 5, tracks: ["manzil"] }));
    expect(res.status).toBe(403);
  });

  it("عدد لا يطابق مقاطع الورد الفعلية: 400", async () => {
    dbMocks.setWardReviewTracks.mockResolvedValue("count_mismatch");
    const res = await PATCH(req({ id: 5, tracks: ["sabqi"] }));
    expect(res.status).toBe(400);
  });

  it("نجاح: 200 {ok:true} — الحلقة من الجلسة لا من الجسم", async () => {
    dbMocks.setWardReviewTracks.mockResolvedValue("ok");
    const res = await PATCH(req({ id: 5, tracks: [null, "manzil"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMocks.setWardReviewTracks).toHaveBeenCalledWith(TEACHER.halaqahId, 5, [null, "manzil"]);
  });
});
