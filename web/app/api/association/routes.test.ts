import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  A3 — مسارات الجمعية: بلا جلسة = 401، وجامع جمعية أخرى (أو بلا جمعية أو
  غير موجود) = 404 بردّ واحد، والقراءات كلها مقيّدة بجمعية الجلسة لا بمعرّف
  من العميل، ولا يوجد أي مسار تعديل لمزايا الجامع. وكوكي الجمعية لا يمنح
  صلاحية جامع (canAccessMosque).
*/

const state = vi.hoisted(() => ({
  admin: null as null | { id: number; associationId: number; username: string; sessionVersion: number },
  mosqueAssociation: new Map<number, number | null>([
    [10, 1],
    [20, 2],
    [30, null],
  ]),
}));

vi.mock("@/lib/association-auth", () => ({
  currentAssociationAdmin: vi.fn(async () => state.admin),
  setAssociationAdminSessionCookie: vi.fn(),
  clearAssociationAdminSession: vi.fn(),
}));

const db = vi.hoisted(() => ({
  getMosqueAssociationId: vi.fn(async (id: number) => state.mosqueAssociation.get(id) ?? null),
  getAssociation: vi.fn(async (id: number) => ({ id, name: `جمعية ${id}`, city: "", createdAt: "" })),
  getAssociationKpis: vi.fn(async () => []),
  listMosqueHalaqahRows: vi.fn(async () => []),
  findAssociationAdminByUsername: vi.fn(),
  markAssociationAdminLogin: vi.fn(),
}));
vi.mock("@/lib/association-db", () => db);

vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(async (id: number) => ({ id, name: `جامع ${id}`, city: "مكة", createdAt: "" })),
  getMosqueFeatures: vi.fn(async () => []),
}));
vi.mock("@/lib/mosque/exams-db", () => ({ examStatsBetween: vi.fn() }));
vi.mock("@/lib/permits-db", () => ({ buildPermitsOverview: vi.fn() }));
// رسوم اللوحات (مواصفة 003) — طبقة تجميع مستقلة تُمحاكى كسائر الطبقات هنا
vi.mock("@/lib/dashboard-charts-db", () => ({
  associationCharts: vi.fn(async () => ({ wardsDaily: [], mosqueComparison: { activeStudents: [], attendanceRate: [] } })),
  mosqueCharts: vi.fn(async () => ({
    wardsDaily: [],
    studentsPerHalaqah: [],
    attendancePerHalaqah: [],
    mastery: { total: 0, buckets: [] },
  })),
}));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  peekRateLimit: vi.fn(async () => true),
  recordRateLimitHit: vi.fn(async () => undefined),
  rateLimited: () => Response.json({ error: "محاولات كثيرة" }, { status: 429 }),
}));
vi.mock("@/lib/client-ip", () => ({ clientIp: () => "1.2.3.4" }));
vi.mock("@/lib/mosque/password", () => ({ verifyPassword: vi.fn(() => false) }));
vi.mock("@/lib/association-registration-db", () => ({ associationLoginRequestStatus: vi.fn(async () => null) }));

const dashboard = await import("./dashboard/route");
const report = await import("./report/route");
const mosqueRoute = await import("./mosques/[mosqueId]/route");
const login = await import("./login/route");
const rateLimit = await import("@/lib/rate-limit");

const url = (path = "") => new Request(`http://localhost/api/association${path}`);
const ctx = (mosqueId: string) => ({ params: Promise.resolve({ mosqueId }) });

beforeEach(() => {
  vi.clearAllMocks();
  state.admin = { id: 1, associationId: 1, username: "assoc1", sessionVersion: 0 };
});

describe("بلا جلسة", () => {
  it("كل المسارات 401 ولا تلمس القاعدة", async () => {
    state.admin = null;
    expect((await dashboard.GET(url("/dashboard"))).status).toBe(401);
    expect((await report.GET(url("/report"))).status).toBe(401);
    expect((await mosqueRoute.GET(url("/mosques/10"), ctx("10"))).status).toBe(401);
    expect(db.getAssociationKpis).not.toHaveBeenCalled();
    expect(db.listMosqueHalaqahRows).not.toHaveBeenCalled();
  });
});

describe("مدير جمعية يقرأ جوامعه فقط", () => {
  it("جامع جمعيته: 200", async () => {
    const res = await mosqueRoute.GET(url("/mosques/10"), ctx("10"));
    expect(res.status).toBe(200);
    expect((db.listMosqueHalaqahRows.mock.calls as unknown[][])[0][0]).toBe(10);
  });

  it("جامع جمعية أخرى: 404 ولا قراءة لبياناته", async () => {
    const res = await mosqueRoute.GET(url("/mosques/20"), ctx("20"));
    expect(res.status).toBe(404);
    expect(db.listMosqueHalaqahRows).not.toHaveBeenCalled();
  });

  it("جامع بلا جمعية أو غير موجود أو معرّف معطوب: نفس الـ404", async () => {
    for (const id of ["30", "999", "abc", "-1", "0", "10abc"]) {
      expect((await mosqueRoute.GET(url(`/mosques/${id}`), ctx(id))).status, id).toBe(404);
    }
    expect(db.listMosqueHalaqahRows).not.toHaveBeenCalled();
  });

  it("ردّ جامع الجمعية الأخرى لا يختلف عن غير الموجود (لا كشف وجوده)", async () => {
    const other = await mosqueRoute.GET(url("/mosques/20"), ctx("20"));
    const missing = await mosqueRoute.GET(url("/mosques/999"), ctx("999"));
    expect(await other.text()).toBe(await missing.text());
  });

  it("لوحة الجمعية وتقريرها يستخدمان جمعية الجلسة حصراً (لا معامل من العميل)", async () => {
    state.admin = { id: 2, associationId: 2, username: "assoc2", sessionVersion: 0 };
    await dashboard.GET(url("/dashboard?associationId=1"));
    await report.GET(url("/report?associationId=1&format=csv"));
    for (const call of db.getAssociationKpis.mock.calls as unknown[][]) expect(call[0]).toBe(2);
    expect(db.getAssociationKpis).toHaveBeenCalledTimes(2);
  });

  it("فترة معطوبة: 400", async () => {
    expect((await dashboard.GET(url("/dashboard?from=bad&to=worse"))).status).toBe(400);
  });

  it("تقرير CSV: نوع المحتوى والمرفق وBOM", async () => {
    const res = await report.GET(url("/report?format=csv"));
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8
  });
});

describe("لا تعديل من لوحة الجمعية", () => {
  it("مسارات الجمعية للقراءة فقط: لا POST/PUT/PATCH/DELETE على الجامع", () => {
    const exported = Object.keys(mosqueRoute).filter((k) => ["POST", "PUT", "PATCH", "DELETE"].includes(k));
    expect(exported).toEqual([]);
    expect(Object.keys(dashboard).filter((k) => k !== "GET")).toEqual([]);
    expect(Object.keys(report).filter((k) => k !== "GET")).toEqual([]);
  });
});

describe("دخول مدير الجمعية", () => {
  it("بيانات خاطئة: 401 برسالة واحدة وتُحتسب محاولة فاشلة", async () => {
    db.findAssociationAdminByUsername.mockResolvedValueOnce(null);
    const res = await login.POST(
      new Request("http://localhost/api/association/login", {
        method: "POST",
        body: JSON.stringify({ username: "nobody", password: "x" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(rateLimit.recordRateLimitHit).toHaveBeenCalledTimes(2);
  });

  it("تجاوز حد المحاولات: 429 قبل أي بحث بالحسابات", async () => {
    vi.mocked(rateLimit.peekRateLimit).mockResolvedValueOnce(false);
    const res = await login.POST(
      new Request("http://localhost/api/association/login", {
        method: "POST",
        body: JSON.stringify({ username: "a", password: "b" }),
      }),
    );
    expect(res.status).toBe(429);
    expect(db.findAssociationAdminByUsername).not.toHaveBeenCalled();
  });
});
