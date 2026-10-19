import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMosqueAdminByUsername: vi.fn(),
  verifyPassword: vi.fn(),
  loginRequestStatus: vi.fn(),
  peekRateLimit: vi.fn(),
  recordRateLimitHit: vi.fn(),
  setMosqueAdminSessionCookie: vi.fn(),
}));
vi.mock("@/lib/mosque/db", () => ({ findMosqueAdminByUsername: mocks.findMosqueAdminByUsername }));
vi.mock("@/lib/mosque/password", () => ({ verifyPassword: mocks.verifyPassword }));
vi.mock("@/lib/mosque-registration-db", () => ({ loginRequestStatus: mocks.loginRequestStatus }));
vi.mock("@/lib/rate-limit", () => ({
  peekRateLimit: mocks.peekRateLimit,
  recordRateLimitHit: mocks.recordRateLimitHit,
  rateLimited: () => Response.json({ error: "محاولات كثيرة" }, { status: 429 }),
}));
vi.mock("@/lib/mosque-auth", () => ({ setMosqueAdminSessionCookie: mocks.setMosqueAdminSessionCookie }));
vi.mock("@/lib/activity", () => ({ recordLogin: vi.fn() }));

const { POST } = await import("./route");

const login = (username: string, password: string) =>
  POST(
    new Request("http://localhost/api/mosque-admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.peekRateLimit.mockResolvedValue(true);
  mocks.findMosqueAdminByUsername.mockResolvedValue(null);
  mocks.loginRequestStatus.mockResolvedValue(null);
});

describe("POST /api/mosque-admin/login — حالة طلب التسجيل", () => {
  it("طلب معلّق ببيانات صحيحة → 403 «قيد المراجعة» بلا احتساب فشل ولا جلسة", async () => {
    mocks.loginRequestStatus.mockResolvedValue({ status: "pending", reason: null });
    const res = await login("Noor", "secret123");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("registration_pending");
    expect(body.error).toBe("طلب تسجيل جامعك قيد المراجعة");
    expect(mocks.loginRequestStatus).toHaveBeenCalledWith("noor", "secret123");
    expect(mocks.recordRateLimitHit).not.toHaveBeenCalled();
    expect(mocks.setMosqueAdminSessionCookie).not.toHaveBeenCalled();
  });

  it("طلب مرفوض → رسالة فيها سبب الرفض", async () => {
    mocks.loginRequestStatus.mockResolvedValue({ status: "rejected", reason: "بيانات ناقصة" });
    const res = await login("noor", "secret123");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("registration_rejected");
    expect(body.error).toContain("بيانات ناقصة");
  });

  it("لا طلب ولا مدير → 401 عام ويُحتسب الفشل", async () => {
    const res = await login("ghost", "whatever1");
    expect(res.status).toBe(401);
    expect(mocks.recordRateLimitHit).toHaveBeenCalledTimes(2);
  });

  it("مدير قائم بكلمة خاطئة → 401 عام ولا يُستعلم عن الطلبات (لا تسريب)", async () => {
    mocks.findMosqueAdminByUsername.mockResolvedValue({ id: 1, mosqueId: 2, username: "noor", passwordHash: "h" });
    mocks.verifyPassword.mockReturnValue(false);
    const res = await login("noor", "wrong");
    expect(res.status).toBe(401);
    expect(mocks.loginRequestStatus).not.toHaveBeenCalled();
  });

  it("مدير قائم بكلمة صحيحة → ينجح ويضبط الجلسة", async () => {
    mocks.findMosqueAdminByUsername.mockResolvedValue({ id: 1, mosqueId: 2, username: "noor", passwordHash: "h" });
    mocks.verifyPassword.mockReturnValue(true);
    const res = await login("noor", "right");
    expect(res.status).toBe(200);
    expect(mocks.setMosqueAdminSessionCookie).toHaveBeenCalledWith(1);
  });
});
