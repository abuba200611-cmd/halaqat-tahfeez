import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B4 — صلاحيات زيارات الجمعية: بلا جلسة = 401، والجامع/الزيارة خارج جمعية
  الجلسة = 404 واحد لا يُكشف به وجود الجامع ولا تمييز بينه وبين جامع جمعية
  أخرى، والمعرّفات كلها من الجلسة لا من العميل.
*/

const state = vi.hoisted(() => ({
  admin: { id: 7, associationId: 3, username: "admin", sessionVersion: 0 } as object | null,
  /** جمعية الجامع المستهدف — null = جامع بلا جمعية */
  mosqueAssociationId: 3 as number | null,
  featureOn: true,
}));

vi.mock("@/lib/association-auth", () => ({
  currentAssociationAdmin: vi.fn(async () => state.admin),
}));
vi.mock("@/lib/association-db", () => ({
  getMosqueAssociationId: vi.fn(async () => state.mosqueAssociationId),
}));
vi.mock("@/lib/mosque/db", () => ({
  isFeatureEnabled: vi.fn(async () => state.featureOn),
  getMosque: vi.fn(async () => ({ id: 5, name: "جامع", city: "", createdAt: "" })),
}));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(async () => true), rateLimited: vi.fn(() => new Response("429")) }));

const visitsDb = vi.hoisted(() => ({
  listVisitsForAssociation: vi.fn(async () => []),
  listAssociationVisitTargets: vi.fn(async () => []),
  getHalaqahInMosque: vi.fn(async () => ({ id: 9, name: "حلقة", mosqueId: 5, mosqueName: "جامع", teacherNames: "" })),
  createVisit: vi.fn(async (input: unknown) => input),
  getVisitForAssociation: vi.fn(async () => null),
  getVisitCriteria: vi.fn(async () => []),
  getVisitScores: vi.fn(async () => ({})),
  applyVisitAction: vi.fn(),
}));
vi.mock("@/lib/supervisor-visits-db", () => visitsDb);

const list = await import("./route");
const detail = await import("./[visitId]/route");

const ctx = (visitId: string) => ({ params: Promise.resolve({ visitId }) });
const req = (body?: unknown, method = "GET") =>
  new Request("http://localhost/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.admin = { id: 7, associationId: 3, username: "admin", sessionVersion: 0 };
  state.mosqueAssociationId = 3;
  state.featureOn = true;
});

describe("بوابة الجلسة", () => {
  it("بلا جلسة مدير جمعية: 401 ولا قراءة", async () => {
    state.admin = null;
    expect((await list.GET()).status).toBe(401);
    expect((await detail.GET(req(), ctx("12"))).status).toBe(401);
    expect(visitsDb.listVisitsForAssociation).not.toHaveBeenCalled();
  });
});

describe("جدولة زيارة — الانتماء يُتحقق خادمياً", () => {
  it("جامع جمعية أخرى: 404 ولا إنشاء", async () => {
    state.mosqueAssociationId = 99;
    const res = await list.POST(req({ mosqueId: 5, halaqahId: 9, scheduledFor: "2026-11-20" }, "POST"));
    expect(res.status).toBe(404);
    expect(visitsDb.createVisit).not.toHaveBeenCalled();
  });

  it("جامع بلا جمعية: 404 نفسه (لا تمييز)", async () => {
    state.mosqueAssociationId = null;
    const res = await list.POST(req({ mosqueId: 5, halaqahId: 9, scheduledFor: "2026-11-20" }, "POST"));
    expect(res.status).toBe(404);
    expect(visitsDb.createVisit).not.toHaveBeenCalled();
  });

  it("ميزة معطّلة بالجامع: 404 — الجمعية لا تتجاوز إعداد الجامع", async () => {
    state.featureOn = false;
    const res = await list.POST(req({ mosqueId: 5, halaqahId: 9, scheduledFor: "2026-11-20" }, "POST"));
    expect(res.status).toBe(404);
    expect(visitsDb.createVisit).not.toHaveBeenCalled();
  });

  it("حلقة ليست من جامع الطلب: 404", async () => {
    visitsDb.getHalaqahInMosque.mockResolvedValueOnce(null as never);
    const res = await list.POST(req({ mosqueId: 5, halaqahId: 9, scheduledFor: "2026-11-20" }, "POST"));
    expect(res.status).toBe(404);
    expect(visitsDb.createVisit).not.toHaveBeenCalled();
  });

  it("صالح: يُنشأ بمعرّف جمعية الجلسة (لا من الجسم) وبزائر الجمعية", async () => {
    const res = await list.POST(
      req({ mosqueId: 5, halaqahId: 9, scheduledFor: "2026-11-20", associationId: 999 }, "POST"),
    );
    expect(res.status).toBe(200);
    expect(visitsDb.createVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        associationId: 3, // من الجلسة حصراً — تجاهل associationId بالجسم
        mosqueId: 5,
        halaqahId: 9,
        visitorKind: "association_admin",
        visitorId: 7,
        scheduledFor: "2026-11-20",
      }),
    );
  });

  it("جسم ناقص: 400", async () => {
    expect((await list.POST(req({ halaqahId: 9 }, "POST"))).status).toBe(400);
    expect((await list.POST(req({ mosqueId: 5, halaqahId: 9, scheduledFor: "not-a-date" }, "POST"))).status).toBe(400);
    expect(visitsDb.createVisit).not.toHaveBeenCalled();
  });
});

describe("قائمة وتفاصيل — نطاق جمعية الجلسة", () => {
  it("القائمة بمعرّف جمعية الجلسة", async () => {
    const res = await list.GET();
    expect(res.status).toBe(200);
    expect(visitsDb.listVisitsForAssociation).toHaveBeenCalledWith(3);
  });

  it("زيارة جامع جمعية أخرى (الطبقة null): 404 ولا تنفيذ إجراء", async () => {
    const res = await detail.PUT(req({ action: "done" }, "PUT"), ctx("12"));
    expect(res.status).toBe(404);
    expect(visitsDb.applyVisitAction).not.toHaveBeenCalled();
  });

  it("معرّف زيارة غير رقمي: 404", async () => {
    expect((await detail.GET(req(), ctx("abc"))).status).toBe(404);
    expect((await detail.GET(req(), ctx("0"))).status).toBe(404);
  });

  it("تفاصيل زيارة الجمعية تُقرأ بمعايير جامعها", async () => {
    visitsDb.getVisitForAssociation.mockResolvedValueOnce({ id: 12, mosqueId: 5, status: "done" } as never);
    const res = await detail.GET(req(), ctx("12"));
    expect(res.status).toBe(200);
    expect(visitsDb.getVisitCriteria).toHaveBeenCalledWith(5);
    expect(visitsDb.getVisitScores).toHaveBeenCalledWith(12);
  });
});
