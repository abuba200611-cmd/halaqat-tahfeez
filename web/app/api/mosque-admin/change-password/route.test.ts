import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const authMocks = vi.hoisted(() => ({
  currentMosqueAdmin: vi.fn(),
  setMosqueAdminSessionCookie: vi.fn(),
}));
vi.mock("@/lib/mosque-auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ mosqueAdminPasswordHash: vi.fn(), updateMosqueAdminPassword: vi.fn() }));
vi.mock("@/lib/mosque/db", () => dbMocks);

const rate = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "x" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rate);
vi.mock("@/lib/dev-impersonation", () => ({ guardImpersonation: vi.fn(async () => null) }));

const { hashPassword } = await import("@/lib/auth");
const { POST } = await import("./route");

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/mosque-admin/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const BODY = { currentPassword: "old-password-1", newPassword: "new-password-2", confirmPassword: "new-password-2" };

describe("POST /api/mosque-admin/change-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rate.checkRateLimit.mockResolvedValue(true);
    authMocks.currentMosqueAdmin.mockResolvedValue({ id: 4, mosqueId: 11, username: "a", sessionVersion: 0 });
    dbMocks.mosqueAdminPasswordHash.mockResolvedValue(hashPassword("old-password-1"));
  });

  it("غير المسجّل: 401", async () => {
    authMocks.currentMosqueAdmin.mockResolvedValue(null);
    expect((await POST(postReq(BODY))).status).toBe(401);
  });

  it("النجاح: يحدّث كلمة المرور (فترفع النسخة) ثم يعيد إصدار كوكي هذا الجهاز بعدها", async () => {
    const order: string[] = [];
    dbMocks.updateMosqueAdminPassword.mockImplementation(async () => void order.push("update"));
    authMocks.setMosqueAdminSessionCookie.mockImplementation(async () => void order.push("cookie"));
    const res = await POST(postReq(BODY));
    expect(res.status).toBe(200);
    expect(dbMocks.updateMosqueAdminPassword).toHaveBeenCalledWith(4, expect.stringContaining(":"));
    expect(authMocks.setMosqueAdminSessionCookie).toHaveBeenCalledWith(4);
    expect(order).toEqual(["update", "cookie"]);
  });

  it("الحالية خاطئة: 403 بلا تحديث ولا كوكي", async () => {
    const res = await POST(postReq({ ...BODY, currentPassword: "wrong-wrong" }));
    expect(res.status).toBe(403);
    expect(dbMocks.updateMosqueAdminPassword).not.toHaveBeenCalled();
    expect(authMocks.setMosqueAdminSessionCookie).not.toHaveBeenCalled();
  });
});
