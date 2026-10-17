import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  A3 — بوابة ميزتَي «التصاريح» و«تقييم المعلّمين»: الميزة معطّلة = 404 قبل أي
  قراءة أو كتابة، وبلا صلاحية = 401، ومعرّف غير رقمي = 404. featureGate حقيقي
  هنا (لا محاكاة له)؛ الطبقات الأدنى فقط مُحاكاة.
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
  currentMosqueActor: vi.fn(async () => ({ kind: "mosque_admin", id: 1, label: "مدير الجامع" })),
}));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const permitsDb = vi.hoisted(() => ({
  buildPermitsOverview: vi.fn(async () => ({ halaqat: [], suggestions: [], log: [] })),
  recordUpgradeRequest: vi.fn(async () => undefined),
  getPermitsConfig: vi.fn(async () => ({})),
  setPermitsConfig: vi.fn(async () => undefined),
  applyPermitActionDb: vi.fn(async () => ({ ok: true, permit: { status: "active" }, fromStatus: null })),
}));
vi.mock("@/lib/permits-db", () => permitsDb);

const evalDb = vi.hoisted(() => ({
  resolveEvalPeriod: vi.fn(),
  listEvalTeachers: vi.fn(async () => []),
  listEvaluations: vi.fn(async () => []),
  buildIncentiveReport: vi.fn(async () => ({ halaqat: [], total: {} })),
  getTeacherEvalConfig: vi.fn(async () => ({})),
  setTeacherEvalConfig: vi.fn(async () => undefined),
  getEvalTeacher: vi.fn(async () => null),
  getEvaluation: vi.fn(async () => null),
  computeTeacherIndicators: vi.fn(),
  saveEvaluation: vi.fn(),
}));
vi.mock("@/lib/teacher-eval-db", () => evalDb);

const permits = await import("./route");
const permitsSettings = await import("./settings/route");
const permitsHalaqah = await import("./[halaqahId]/route");
const evalList = await import("../teacher-eval/route");
const evalSettings = await import("../teacher-eval/settings/route");
const evalDetail = await import("../teacher-eval/[teacherId]/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ctx2 = (id: string, second: string, key: "halaqahId" | "teacherId") => ({
  params: Promise.resolve({ id, [key]: second } as { id: string; halaqahId: string; teacherId: string }),
});
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
  it("مسارات التصاريح كلها", async () => {
    const responses = [
      await permits.GET(req(), ctx("5")),
      await permits.POST(req({ action: "upgrade_request" }, "POST"), ctx("5")),
      await permitsSettings.GET(req(), ctx("5")),
      await permitsSettings.PUT(req({ minActiveStudents: 5 }, "PUT"), ctx("5")),
      await permitsHalaqah.POST(req({ action: "suspend" }, "POST"), ctx2("5", "9", "halaqahId")),
    ];
    for (const res of responses) expect(res.status).toBe(404);
    expect(permitsDb.buildPermitsOverview).not.toHaveBeenCalled();
    expect(permitsDb.recordUpgradeRequest).not.toHaveBeenCalled();
    expect(permitsDb.setPermitsConfig).not.toHaveBeenCalled();
    expect(permitsDb.applyPermitActionDb).not.toHaveBeenCalled();
  });

  it("مسارات تقييم المعلّمين كلها", async () => {
    const responses = [
      await evalList.GET(req(), ctx("5")),
      await evalSettings.GET(req(), ctx("5")),
      await evalSettings.PUT(req({ thresholds: { renewMin: 80 } }, "PUT"), ctx("5")),
      await evalDetail.GET(req(), ctx2("5", "3", "teacherId")),
      await evalDetail.PUT(req({ scores: {} }, "PUT"), ctx2("5", "3", "teacherId")),
    ];
    for (const res of responses) expect(res.status).toBe(404);
    expect(evalDb.listEvalTeachers).not.toHaveBeenCalled();
    expect(evalDb.setTeacherEvalConfig).not.toHaveBeenCalled();
    expect(evalDb.saveEvaluation).not.toHaveBeenCalled();
    expect(evalDb.getEvalTeacher).not.toHaveBeenCalled();
  });
});

describe("الصلاحية والمعاملات", () => {
  it("بلا صلاحية على الجامع: 401 حتى لو الميزة مفعّلة", async () => {
    state.canAccess = false;
    state.featureOn = true;
    expect((await permits.GET(req(), ctx("5"))).status).toBe(401);
    expect((await evalList.GET(req(), ctx("5"))).status).toBe(401);
    expect(permitsDb.buildPermitsOverview).not.toHaveBeenCalled();
  });

  it("معرّف جامع أو حلقة أو معلّم غير رقمي: 404", async () => {
    state.featureOn = true;
    expect((await permits.GET(req(), ctx("abc"))).status).toBe(404);
    expect((await permitsHalaqah.POST(req({ action: "suspend" }, "POST"), ctx2("5", "x", "halaqahId"))).status).toBe(404);
    expect((await evalDetail.GET(req(), ctx2("5", "0", "teacherId"))).status).toBe(404);
  });
});

describe("الميزة مفعّلة", () => {
  beforeEach(() => {
    state.featureOn = true;
  });

  it("GET التصاريح يقرأ نظرة الجامع نفسه", async () => {
    const res = await permits.GET(req(), ctx("5"));
    expect(res.status).toBe(200);
    expect(permitsDb.buildPermitsOverview).toHaveBeenCalledWith(5);
  });

  it("إجراء غير معروف: 400 ولا تنفيذ", async () => {
    const res = await permitsHalaqah.POST(req({ action: "delete_everything" }, "POST"), ctx2("5", "9", "halaqahId"));
    expect(res.status).toBe(400);
    expect(permitsDb.applyPermitActionDb).not.toHaveBeenCalled();
  });

  it("إجراء صالح يمرّ للطبقة بمعرّف الجامع من المسار والفاعل المسجَّل", async () => {
    const res = await permitsHalaqah.POST(req({ action: "suspend", notes: "قلة طلاب" }, "POST"), ctx2("5", "9", "halaqahId"));
    expect(res.status).toBe(200);
    expect(permitsDb.applyPermitActionDb).toHaveBeenCalledWith(
      expect.objectContaining({ mosqueId: 5, halaqahId: 9, action: "suspend", notes: "قلة طلاب" }),
    );
  });

  it("حلقة جامع آخر: خطأ الطبقة (404) يصل كما هو", async () => {
    permitsDb.applyPermitActionDb.mockResolvedValueOnce({ ok: false, status: 404, error: "الحلقة غير موجودة في هذا الجامع" } as never);
    const res = await permitsHalaqah.POST(req({ action: "suspend" }, "POST"), ctx2("5", "9", "halaqahId"));
    expect(res.status).toBe(404);
  });

  it("إعدادات معطوبة: 400 ولا حفظ", async () => {
    const res = await permitsSettings.PUT(req({ minActiveStudents: -3 }, "PUT"), ctx("5"));
    expect(res.status).toBe(400);
    expect(permitsDb.setPermitsConfig).not.toHaveBeenCalled();
  });

  it("تقييم: درجة خارج المدى = 400 ولا حفظ", async () => {
    evalDb.getEvalTeacher.mockResolvedValueOnce({ id: 3, name: "م", halaqahId: 9, halaqahName: "ح", role: "supervisor" } as never);
    const config = (await import("@/lib/teacher-eval")).DEFAULT_TEACHER_EVAL_CONFIG;
    evalDb.resolveEvalPeriod.mockResolvedValueOnce({
      ok: true,
      period: { year: 1448, term: "year", key: "1448", range: { from: "2026-08-14", to: "2027-08-02" }, config },
    } as never);
    const res = await evalDetail.PUT(req({ scores: { discipline: 150 } }, "PUT"), ctx2("5", "3", "teacherId"));
    expect(res.status).toBe(400);
    expect(evalDb.saveEvaluation).not.toHaveBeenCalled();
  });
});
