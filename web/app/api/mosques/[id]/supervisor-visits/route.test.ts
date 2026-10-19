import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B4 — بوابة ميزة «زيارات المشرف التربوي» بمسارات الجامع: الميزة معطّلة =
  404 قبل أي قراءة أو كتابة، وبلا صلاحية = 401، ومعرّف غير رقمي = 404،
  وحلقة جامع آخر = 404 ولا إنشاء. featureGate حقيقي هنا؛ الطبقات الأدنى
  فقط مُحاكاة.
*/

const state = vi.hoisted(() => ({
  canAccess: true,
  featureOn: false,
  mosqueExists: true,
}));

vi.mock("@/lib/mosque/admin-auth", () => ({
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
  isAdmin: vi.fn(async () => false),
}));
vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn(async () => state.canAccess) }));
vi.mock("@/lib/mosque/db", () => ({
  isFeatureEnabled: vi.fn(async () => state.featureOn),
  getMosque: vi.fn(async () => (state.mosqueExists ? { id: 5, name: "جامع", city: "", createdAt: "" } : null)),
}));
vi.mock("@/lib/mosque/actor", () => ({
  currentMosqueActor: vi.fn(async () => ({ kind: "mosque_admin", id: 77, label: "مدير الجامع" })),
}));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), rateLimited: vi.fn(() => new Response("429")) }));

const visitsDb = vi.hoisted(() => ({
  listVisitsForMosque: vi.fn(async () => []),
  getVisitCriteria: vi.fn(async () => []),
  setVisitCriteria: vi.fn(async () => undefined),
  getHalaqahInMosque: vi.fn(async () => null),
  createVisit: vi.fn(),
  getVisitForMosque: vi.fn(async () => null),
  getVisitScores: vi.fn(async () => ({})),
  applyVisitAction: vi.fn(),
  halaqahVisitAverages: vi.fn(async () => []),
}));
vi.mock("@/lib/supervisor-visits-db", () => visitsDb);

const list = await import("./route");
const detail = await import("./[visitId]/route");
const settings = await import("./settings/route");
const summary = await import("./summary/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ctx2 = (id: string, visitId: string) => ({ params: Promise.resolve({ id, visitId }) });
const req = (body?: unknown, method = "GET") =>
  new Request("http://localhost/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.canAccess = true;
  state.featureOn = false;
  state.mosqueExists = true;
});

describe("الميزة معطّلة ← 404 بلا أي قراءة أو كتابة", () => {
  it("كل مسارات الزيارات", async () => {
    const responses = [
      await list.GET(req(), ctx("5")),
      await list.POST(req({ halaqahId: 9, scheduledFor: "2026-11-20" }, "POST"), ctx("5")),
      await detail.GET(req(), ctx2("5", "12")),
      await detail.PUT(req({ action: "save" }, "PUT"), ctx2("5", "12")),
      await settings.GET(req(), ctx("5")),
      await settings.PUT(req({ criteria: [{ key: "a", label: "أ" }] }, "PUT"), ctx("5")),
      await summary.GET(req(), ctx("5")),
    ];
    for (const res of responses) expect(res.status).toBe(404);
    expect(visitsDb.listVisitsForMosque).not.toHaveBeenCalled();
    expect(visitsDb.createVisit).not.toHaveBeenCalled();
    expect(visitsDb.getVisitForMosque).not.toHaveBeenCalled();
    expect(visitsDb.applyVisitAction).not.toHaveBeenCalled();
    expect(visitsDb.halaqahVisitAverages).not.toHaveBeenCalled();
  });
});

describe("الصلاحية والمعاملات", () => {
  it("بلا صلاحية على الجامع: 401 حتى لو الميزة مفعّلة", async () => {
    state.canAccess = false;
    state.featureOn = true;
    expect((await list.GET(req(), ctx("5"))).status).toBe(401);
    expect((await detail.PUT(req({ action: "done" }, "PUT"), ctx2("5", "12"))).status).toBe(401);
    expect(visitsDb.listVisitsForMosque).not.toHaveBeenCalled();
    expect(visitsDb.applyVisitAction).not.toHaveBeenCalled();
  });

  it("معرّف جامع أو زيارة غير رقمي: 404", async () => {
    state.featureOn = true;
    expect((await list.GET(req(), ctx("abc"))).status).toBe(404);
    expect((await detail.GET(req(), ctx2("5", "x"))).status).toBe(404);
  });
});

describe("الميزة مفعّلة", () => {
  beforeEach(() => {
    state.featureOn = true;
  });

  it("GET القائمة يقرأ زيارات الجامع نفسه بمعرّف المسار", async () => {
    const res = await list.GET(req(), ctx("5"));
    expect(res.status).toBe(200);
    expect(visitsDb.listVisitsForMosque).toHaveBeenCalledWith(5);
  });

  it("جدولة بحلقة جامع آخر (الطبقة ترجّع null): 404 ولا إنشاء", async () => {
    const res = await list.POST(req({ halaqahId: 9, scheduledFor: "2026-11-20" }, "POST"), ctx("5"));
    expect(res.status).toBe(404);
    expect(visitsDb.createVisit).not.toHaveBeenCalled();
  });

  it("جدولة صالحة: تُنشأ بجامع المسار وزائر إدارة الجامع", async () => {
    visitsDb.getHalaqahInMosque.mockResolvedValueOnce({
      id: 9,
      name: "حلقة",
      mosqueId: 5,
      mosqueName: "جامع",
      teacherNames: "",
    } as never);
    const res = await list.POST(req({ halaqahId: 9, scheduledFor: "2026-11-20" }, "POST"), ctx("5"));
    expect(res.status).toBe(200);
    expect(visitsDb.createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        associationId: null,
        mosqueId: 5,
        halaqahId: 9,
        visitorKind: "mosque_admin",
        visitorId: 77,
        scheduledFor: "2026-11-20",
      }),
    );
  });

  it("موعد معطوب: 400 ولا إنشاء", async () => {
    const res = await list.POST(req({ halaqahId: 9, scheduledFor: "2026-02-30" }, "POST"), ctx("5"));
    expect(res.status).toBe(400);
    expect(visitsDb.createVisit).not.toHaveBeenCalled();
  });

  it("زيارة جامع آخر (getVisitForMosque = null): 404 ولا تنفيذ إجراء", async () => {
    const res = await detail.PUT(req({ action: "done" }, "PUT"), ctx2("5", "12"));
    expect(res.status).toBe(404);
    expect(visitsDb.applyVisitAction).not.toHaveBeenCalled();
  });

  it("تفاصيل زيارة الجامع تُقرأ بدرجاتها ومعاييره", async () => {
    visitsDb.getVisitForMosque.mockResolvedValueOnce({ id: 12, mosqueId: 5, status: "scheduled" } as never);
    const res = await detail.GET(req(), ctx2("5", "12"));
    expect(res.status).toBe(200);
    expect(visitsDb.getVisitCriteria).toHaveBeenCalledWith(5);
    expect(visitsDb.getVisitScores).toHaveBeenCalledWith(12);
  });

  it("خطأ الطبقة (ملغاة = 400) يصل كما هو", async () => {
    visitsDb.getVisitForMosque.mockResolvedValueOnce({ id: 12, mosqueId: 5, status: "cancelled" } as never);
    visitsDb.applyVisitAction.mockResolvedValueOnce({ ok: false, status: 400, error: "زيارة ملغاة لا تُعدَّل" } as never);
    const res = await detail.PUT(req({ action: "save" }, "PUT"), ctx2("5", "12"));
    expect(res.status).toBe(400);
  });

  it("معايير معطوبة: 400 ولا حفظ", async () => {
    const res = await settings.PUT(req({ criteria: [{ key: "", label: "بلا مفتاح" }] }, "PUT"), ctx("5"));
    expect(res.status).toBe(400);
    expect(visitsDb.setVisitCriteria).not.toHaveBeenCalled();
  });
});
