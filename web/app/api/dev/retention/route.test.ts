import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  isDevConsoleRequest: vi.fn(),
  currentImpersonation: vi.fn(),
  runRetentionCleanup: vi.fn(),
  logDevAction: vi.fn(),
}));

vi.mock("@/lib/mosque/admin-auth", () => ({
  isAdmin: mocks.isAdmin,
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
}));
vi.mock("@/lib/host-gate", () => ({
  isDevConsoleRequest: mocks.isDevConsoleRequest,
  hostNotFound: () => new Response(null, { status: 404 }),
}));
vi.mock("@/lib/dev-impersonation", () => ({
  currentImpersonation: mocks.currentImpersonation,
  impersonationBlocked: () => Response.json({ error: "أثناء العرض كـ" }, { status: 403 }),
}));
vi.mock("@/lib/retention", () => ({ runRetentionCleanup: mocks.runRetentionCleanup }));
vi.mock("@/lib/dev-audit", () => ({ logDevAction: mocks.logDevAction }));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn() }));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDevConsoleRequest.mockResolvedValue(true);
  mocks.isAdmin.mockResolvedValue(true);
  mocks.currentImpersonation.mockResolvedValue(null);
  mocks.runRetentionCleanup.mockResolvedValue([
    { key: "password_resets", label: "x", deleted: 3 },
    { key: "rate_limits", label: "y", deleted: 0, error: true },
  ]);
});

describe("POST /api/dev/retention", () => {
  it("مستضيف عام = 404 بلا تنفيذ", async () => {
    mocks.isDevConsoleRequest.mockResolvedValue(false);
    expect((await POST()).status).toBe(404);
    expect(mocks.runRetentionCleanup).not.toHaveBeenCalled();
  });

  it("بلا جلسة أدمن = 401 بلا تنفيذ", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect((await POST()).status).toBe(401);
    expect(mocks.runRetentionCleanup).not.toHaveBeenCalled();
  });

  it("أثناء «عرض كـ» = 403", async () => {
    mocks.currentImpersonation.mockResolvedValue({ kind: "teacher" });
    expect((await POST()).status).toBe(403);
    expect(mocks.runRetentionCleanup).not.toHaveBeenCalled();
  });

  it("ينفّذ ويُسجّل في سجل التدقيق", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, total: 3 });
    expect(mocks.logDevAction).toHaveBeenCalledWith("retention_cleanup", "system", "retention", {
      total: 3,
      password_resets: 3,
      rate_limits: "error",
    });
  });
});
