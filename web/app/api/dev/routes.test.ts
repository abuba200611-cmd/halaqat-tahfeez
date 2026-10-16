import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  بوابة /api/dev: بلا جلسة أدمن = 401، وأثناء «عرض كـ» = 403، ومن
  مستضيج عام = 404 (dev split — خط الدفاع الثاني خلف proxy.ts) — تشمل
  نظرة عامة والمستخدمين والصحة وسجل التدقيق.
*/

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  isDevConsoleRequest: vi.fn(),
  currentImpersonation: vi.fn(),
  devOverview: vi.fn(),
  searchDevUsers: vi.fn(),
  devHealth: vi.fn(),
  listRecentServerErrors: vi.fn(),
  listDevAudit: vi.fn(),
}));

vi.mock("@/lib/mosque/admin-auth", () => ({
  isAdmin: mocks.isAdmin,
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
}));
vi.mock("@/lib/host-gate", () => ({
  isDevConsoleRequest: mocks.isDevConsoleRequest,
  hostNotFound: () => new Response(null, { status: 404 }),
  devHostGate: async () => (await mocks.isDevConsoleRequest() ? null : new Response(null, { status: 404 })),
}));
vi.mock("@/lib/dev-impersonation", () => ({
  currentImpersonation: mocks.currentImpersonation,
  impersonationBlocked: () => Response.json({ error: "أثناء العرض كـ" }, { status: 403 }),
}));
vi.mock("@/lib/dev-db", () => ({
  devOverview: mocks.devOverview,
  searchDevUsers: mocks.searchDevUsers,
  devHealth: mocks.devHealth,
}));
vi.mock("@/lib/dev-error-log", () => ({ listRecentServerErrors: mocks.listRecentServerErrors }));
vi.mock("@/lib/dev-audit", () => ({ listDevAudit: mocks.listDevAudit }));

const { GET: overviewGET } = await import("@/app/api/dev/overview/route");
const { GET: usersGET } = await import("@/app/api/dev/users/route");
const { GET: healthGET } = await import("@/app/api/dev/health/route");
const { GET: auditGET } = await import("@/app/api/dev/audit/route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDevConsoleRequest.mockResolvedValue(true);
  mocks.currentImpersonation.mockResolvedValue(null);
});

describe("حماية مسارات اللوحة", () => {
  it("من مستضيج عام: 404 ولا تُلمس القاعدة ولا جلسة الأدمن نفسها", async () => {
    mocks.isDevConsoleRequest.mockResolvedValue(false);
    mocks.isAdmin.mockResolvedValue(true);

    for (const res of [
      await overviewGET(),
      await usersGET(new Request("http://localhost/api/dev/users?q=ab")),
      await healthGET(),
      await auditGET(),
    ]) {
      expect(res.status).toBe(404);
    }
    expect(mocks.isAdmin).not.toHaveBeenCalled();
    expect(mocks.devOverview).not.toHaveBeenCalled();
    expect(mocks.searchDevUsers).not.toHaveBeenCalled();
    expect(mocks.devHealth).not.toHaveBeenCalled();
    expect(mocks.listDevAudit).not.toHaveBeenCalled();
  });

  it("بلا جلسة أدمن: كل مسارات /api/dev ترجع 401 ولا تلمس القاعدة", async () => {
    mocks.isAdmin.mockResolvedValue(false);

    for (const res of [
      await overviewGET(),
      await usersGET(new Request("http://localhost/api/dev/users?q=ab")),
      await healthGET(),
      await auditGET(),
    ]) {
      expect(res.status).toBe(401);
    }
    expect(mocks.devOverview).not.toHaveBeenCalled();
    expect(mocks.searchDevUsers).not.toHaveBeenCalled();
    expect(mocks.devHealth).not.toHaveBeenCalled();
    expect(mocks.listDevAudit).not.toHaveBeenCalled();
  });

  it("أثناء «عرض كـ»: 403 حتى مع وجود جلسة الأدمن", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.currentImpersonation.mockResolvedValue({ kind: "teacher", targetId: 1 });

    expect((await overviewGET()).status).toBe(403);
    expect((await healthGET()).status).toBe(403);
    expect((await auditGET()).status).toBe(403);
  });

  it("أدمن طبيعي: النظرة العامة تعمل والبحث يمرّ للطبقة", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.devOverview.mockResolvedValue({
      counts: {
        mosques: 1,
        halaqahs: 2,
        teachersActive: 3,
        studentsActive: 4,
        parents: 5,
        registrationsPending: 6,
        wardsLast7Days: 7,
      },
      dbName: "db",
      dbSize: "10 MB",
      deploy: { commitSha: null, commitMessage: null },
    });
    mocks.searchDevUsers.mockResolvedValue([]);

    const overview = await overviewGET();
    expect(overview.status).toBe(200);
    expect(((await overview.json()) as { counts: { mosques: number } }).counts.mosques).toBe(1);

    const users = await usersGET(new Request("http://localhost/api/dev/users?q=ab"));
    expect(users.status).toBe(200);
    expect(mocks.searchDevUsers).toHaveBeenCalledWith("ab");
  });

  it("البحث الموحّد أقصر من محرفين: تلميح بلا استعلام قاعدة", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    const res = await usersGET(new Request("http://localhost/api/dev/users?q=ا"));
    expect(res.status).toBe(200);
    expect(mocks.searchDevUsers).not.toHaveBeenCalled();
  });
});
