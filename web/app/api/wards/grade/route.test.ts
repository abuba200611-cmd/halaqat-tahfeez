import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ERROR_GRADING_CONFIG } from "@/lib/error-grading";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ errorGradingContextForHalaqah: vi.fn(), saveWardErrorGrade: vi.fn() }));
vi.mock("@/lib/error-grading-db", () => dbMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "slow" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const { GET, PUT } = await import("./route");

const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/wards/grade", { method: "PUT", body: JSON.stringify(body) }));

describe("/api/wards/grade — تقييم الورد بنقاط الأخطاء", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateMocks.checkRateLimit.mockResolvedValue(true);
    authMocks.currentTeacher.mockResolvedValue({ id: 4, halaqahId: 9 });
    dbMocks.errorGradingContextForHalaqah.mockResolvedValue({ mosqueId: 1, config: DEFAULT_ERROR_GRADING_CONFIG });
    dbMocks.saveWardErrorGrade.mockResolvedValue({ studentId: "s1" });
  });

  it("GET بلا جلسة: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("GET: الميزة معطّلة ← enabled:false بلا إعدادات", async () => {
    dbMocks.errorGradingContextForHalaqah.mockResolvedValue(null);
    expect(await (await GET()).json()).toEqual({ enabled: false });
  });

  it("GET: الحلقة من الجلسة فقط", async () => {
    const body = await (await GET()).json();
    expect(body.enabled).toBe(true);
    expect(dbMocks.errorGradingContextForHalaqah).toHaveBeenCalledWith(9);
  });

  it("PUT بلا جلسة: 401 ولا حفظ", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await put({ id: 1, counts: {} })).status).toBe(401);
    expect(dbMocks.saveWardErrorGrade).not.toHaveBeenCalled();
  });

  it("PUT: تجاوز الحد 429", async () => {
    rateMocks.checkRateLimit.mockResolvedValue(false);
    expect((await put({ id: 1, counts: {} })).status).toBe(429);
  });

  it("PUT: الميزة معطّلة 404 ولا حفظ", async () => {
    dbMocks.errorGradingContextForHalaqah.mockResolvedValue(null);
    expect((await put({ id: 1, counts: {} })).status).toBe(404);
    expect(dbMocks.saveWardErrorGrade).not.toHaveBeenCalled();
  });

  it.each([{ counts: {} }, { id: "abc", counts: {} }, { id: -3, counts: {} }, { id: 1.5, counts: {} }])(
    "PUT: معرّف ورد غير صالح %j ← 400",
    async (body) => {
      expect((await put(body)).status).toBe(400);
      expect(dbMocks.saveWardErrorGrade).not.toHaveBeenCalled();
    },
  );

  it("PUT: عدّادات غير صالحة أو نوع مجهول ← 400 ولا حفظ", async () => {
    expect((await put({ id: 1, counts: { nope: 1 } })).status).toBe(400);
    expect((await put({ id: 1, counts: { hifz: -1 } })).status).toBe(400);
    expect((await put({ id: 1 })).status).toBe(400);
    expect(dbMocks.saveWardErrorGrade).not.toHaveBeenCalled();
  });

  it("PUT: الخادم يحسب الدرجة ويتجاهل أي درجة من العميل", async () => {
    const res = await put({ id: 5, counts: { hifz: 2, tajweed: 1 }, score: 100, band: "ممتاز" });
    expect(await res.json()).toMatchObject({ ok: true, score: 95.5, band: "ممتاز" });
    // الحلقة من الجلسة (9) لا من الجسم
    expect(dbMocks.saveWardErrorGrade).toHaveBeenCalledWith(9, 5, { hifz: 2, tajweed: 1 }, 95.5, "ممتاز");
  });

  it("PUT: ورد حلقة أخرى (الاستعلام لا يطابق) ← 404", async () => {
    dbMocks.saveWardErrorGrade.mockResolvedValue(null);
    const res = await put({ id: 777, counts: { hifz: 1 } });
    expect(res.status).toBe(404);
    expect(dbMocks.saveWardErrorGrade).toHaveBeenCalledWith(9, 777, { hifz: 1 }, 98, "ممتاز");
  });
});
