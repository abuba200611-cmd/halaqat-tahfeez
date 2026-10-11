import { beforeEach, describe, expect, it, vi } from "vitest";

// نفس نمط اختبار دخول المعلّم: حدّ (اسم المستخدم + الحلقة) على المحاولات
// الفاشلة فقط — peek قبل التحقّق وrecord عند فشله حصراً.
const dbMocks = vi.hoisted(() => ({
  checkLoginRateLimit: vi.fn(async () => true),
  findStudentByUsername: vi.fn(),
  recordFailedLoginAttempt: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const authMocks = vi.hoisted(() => ({
  setStudentSessionCookie: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("@/lib/auth", () => authMocks);

const rateLimitMocks = vi.hoisted(() => ({
  peekRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 })),
  recordRateLimitHit: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

const { POST } = await import("./route");

const STUDENT = { teacherId: 4, id: "s1", name: "أحمد", username: "ahmad", passwordHash: "hash" };

function loginReq(username: string, password: string): Request {
  return new Request("http://localhost/api/student-auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

describe("POST /api/student-auth/login — حدّ اسم المستخدم على الفشل فقط", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.checkLoginRateLimit.mockResolvedValue(true);
    rateLimitMocks.peekRateLimit.mockResolvedValue(true);
  });

  it("دخول ناجح: لا يُحتسب على الحدّ إطلاقاً", async () => {
    dbMocks.findStudentByUsername.mockResolvedValue(STUDENT);
    authMocks.verifyPassword.mockReturnValue(true);

    const res = await POST(loginReq("ahmad", "correct"));

    expect(res.status).toBe(200);
    expect(rateLimitMocks.recordRateLimitHit).not.toHaveBeenCalled();
    expect(authMocks.setStudentSessionCookie).toHaveBeenCalledWith(4, "s1");
  });

  it("كلمة مرور خاطئة: تُحتسب على مفتاح (الحلقة + اسم المستخدم)", async () => {
    dbMocks.findStudentByUsername.mockResolvedValue(STUDENT);
    authMocks.verifyPassword.mockReturnValue(false);

    const res = await POST(loginReq("ahmad", "wrong"));

    expect(res.status).toBe(401);
    expect(rateLimitMocks.recordRateLimitHit).toHaveBeenCalledWith("student-login:4:ahmad", 900);
  });

  it("اسم مستخدم غير موجود: 401، ولا peek ولا احتساب — المفتاح يتطلّب حلقة معروفة", async () => {
    dbMocks.findStudentByUsername.mockResolvedValue(null);

    const res = await POST(loginReq("ghost", "x"));

    expect(res.status).toBe(401);
    expect(rateLimitMocks.peekRateLimit).not.toHaveBeenCalled();
    expect(rateLimitMocks.recordRateLimitHit).not.toHaveBeenCalled();
  });

  it("peek يمنع بعد ١٠ محاولات فاشلة: 429 بلا تحقّق من كلمة المرور ولا احتساب جديد", async () => {
    dbMocks.findStudentByUsername.mockResolvedValue(STUDENT);
    rateLimitMocks.peekRateLimit.mockResolvedValue(false);

    const res = await POST(loginReq("ahmad", "correct"));

    expect(res.status).toBe(429);
    expect(rateLimitMocks.peekRateLimit).toHaveBeenCalledWith("student-login:4:ahmad", 10, 900);
    expect(authMocks.verifyPassword).not.toHaveBeenCalled();
    expect(rateLimitMocks.recordRateLimitHit).not.toHaveBeenCalled();
  });
});
