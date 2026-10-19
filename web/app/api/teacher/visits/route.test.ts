import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B4 — زيارات المشرف بعين المعلّم: بلا جلسة = 401، والحلقة من جلسة المعلّم
  حصراً (المسار لا يقبل معرّف حلقة من العميل أصلاً)، والمنجزة فقط تُعاد،
  وميزة معطّلة بجامع الحلقة = قائمة فارغة (enabled:false).
*/

const state = vi.hoisted(() => ({
  teacher: { id: 4, halaqahId: 9, halaqahName: "حلقة المعلّم" } as object | null,
  /** الجامع المربوطة بحلقة الجلسة */
  mosqueId: 5 as number | null,
  featureOn: true,
}));

vi.mock("@/lib/auth", () => ({
  currentTeacher: vi.fn(async () => state.teacher),
  unauthorized: () => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 }),
}));
vi.mock("@/lib/mosque/db", () => ({
  getHalaqah: vi.fn(async () =>
    state.mosqueId === null
      ? { id: 9, mosqueId: null, halaqahName: "حلقة المعلّم", teacherName: "", createdAt: "" }
      : { id: 9, mosqueId: state.mosqueId, halaqahName: "حلقة المعلّم", teacherName: "", createdAt: "" },
  ),
  isFeatureEnabled: vi.fn(async () => state.featureOn),
}));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const visitsDb = vi.hoisted(() => ({
  listDoneVisitsForHalaqah: vi.fn(async () => []),
  getVisitCriteria: vi.fn(async () => []),
  getVisitScores: vi.fn(async () => ({})),
}));
vi.mock("@/lib/supervisor-visits-db", () => visitsDb);

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  state.teacher = { id: 4, halaqahId: 9, halaqahName: "حلقة المعلّم" };
  state.mosqueId = 5;
  state.featureOn = true;
});

describe("بوابة جلسة المعلّم", () => {
  it("بلا جلسة: 401 ولا قراءة", async () => {
    state.teacher = null;
    const res = await GET();
    expect(res.status).toBe(401);
    expect(visitsDb.listDoneVisitsForHalaqah).not.toHaveBeenCalled();
  });
});

describe("نطاق الحلقة", () => {
  it("القائمة بحلقة الجلسة حصراً — المسار لا يقبل معرّف حلقة من العميل أصلاً", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(visitsDb.listDoneVisitsForHalaqah).toHaveBeenCalledWith(9);
    expect(visitsDb.listDoneVisitsForHalaqah).toHaveBeenCalledTimes(1);
  });

  it("الميزة معطّلة بجامع الحلقة: enabled:false وقائمة فارغة", async () => {
    state.featureOn = false;
    const res = await GET();
    expect(res.status).toBe(200);
    const data = (await res.json()) as { enabled: boolean; visits: unknown[] };
    expect(data.enabled).toBe(false);
    expect(data.visits).toEqual([]);
    expect(visitsDb.listDoneVisitsForHalaqah).not.toHaveBeenCalled();
  });

  it("حلقة بلا جامع: كأن الميزة معطّلة", async () => {
    state.mosqueId = null;
    const res = await GET();
    const data = (await res.json()) as { enabled: boolean };
    expect(data.enabled).toBe(false);
  });

  it("درجات كل زيارة منجزة تُرفق لعرضها", async () => {
    visitsDb.listDoneVisitsForHalaqah.mockResolvedValueOnce([
      { id: 12, mosqueId: 5, halaqahId: 9, status: "done", notes: "", recommendations: "", overallScore: 80 },
    ] as never);
    const res = await GET();
    const data = (await res.json()) as { enabled: boolean; visits: { id: number }[] };
    expect(data.enabled).toBe(true);
    expect(data.visits).toHaveLength(1);
    expect(visitsDb.getVisitScores).toHaveBeenCalledWith(12);
  });
});
