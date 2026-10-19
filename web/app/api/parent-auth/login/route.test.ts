import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  checkLoginRateLimit: vi.fn(async () => true),
  recordFailedLoginAttempt: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const authMocks = vi.hoisted(() => ({ verifyPassword: vi.fn() }));
vi.mock("@/lib/auth", () => authMocks);

const parentAuthMocks = vi.hoisted(() => ({ setParentSessionCookie: vi.fn() }));
vi.mock("@/lib/parent-auth", () => parentAuthMocks);

const parentDbMocks = vi.hoisted(() => ({
  findParentByEmail: vi.fn(),
  normalizeParentEmail: (s: string) => s.trim().toLowerCase(),
}));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const rl = vi.hoisted(() => ({
  peekRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "x" }, { status: 429 })),
  recordRateLimitHit: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => rl);

const { POST } = await import("./route");

const PARENT = { id: 9, name: "أب", email: "a@b.com", passwordHash: "h", sessionVersion: 0 };
const req = (email: string, password: string) =>
  new Request("http://localhost/api/parent-auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

describe("POST /api/parent-auth/login — حدّ البريد على الفشل فقط", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.checkLoginRateLimit.mockResolvedValue(true);
    rl.peekRateLimit.mockResolvedValue(true);
  });

  it("دخول ناجح: لا احتساب على الحدّ، والبريد يُطبَّع", async () => {
    parentDbMocks.findParentByEmail.mockResolvedValue(PARENT);
    authMocks.verifyPassword.mockReturnValue(true);
    const res = await POST(req("  A@B.com ", "pw"));
    expect(res.status).toBe(200);
    expect(parentDbMocks.findParentByEmail).toHaveBeenCalledWith("a@b.com");
    expect(parentAuthMocks.setParentSessionCookie).toHaveBeenCalledWith(9);
    expect(rl.recordRateLimitHit).not.toHaveBeenCalled();
  });

  it("كلمة مرور خاطئة: 401 ويُحتسب على مفتاح البريد", async () => {
    parentDbMocks.findParentByEmail.mockResolvedValue(PARENT);
    authMocks.verifyPassword.mockReturnValue(false);
    const res = await POST(req("a@b.com", "bad"));
    expect(res.status).toBe(401);
    expect(rl.recordRateLimitHit).toHaveBeenCalledWith("parent-login:email:a@b.com", 900);
    expect(parentAuthMocks.setParentSessionCookie).not.toHaveBeenCalled();
  });

  it("بريد غير مسجّل: 404 + no_account (قرار المالك) ونفس الاحتساب", async () => {
    parentDbMocks.findParentByEmail.mockResolvedValue(null);
    const res = await POST(req("ghost@b.com", "x"));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("no_account");
    expect(rl.recordRateLimitHit).toHaveBeenCalledWith("parent-login:email:ghost@b.com", 900);
  });

  it("بعد ١٠ محاولات فاشلة: 429 بلا تحقّق ولا احتساب", async () => {
    rl.peekRateLimit.mockResolvedValue(false);
    const res = await POST(req("a@b.com", "pw"));
    expect(res.status).toBe(429);
    expect(rl.peekRateLimit).toHaveBeenCalledWith("parent-login:email:a@b.com", 10, 900);
    expect(parentDbMocks.findParentByEmail).not.toHaveBeenCalled();
    expect(rl.recordRateLimitHit).not.toHaveBeenCalled();
  });
});
