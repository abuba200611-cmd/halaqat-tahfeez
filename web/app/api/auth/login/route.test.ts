import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  حدّ الدخول لكل بريد صار على المحاولات الفاشلة فقط: فحص (peek) قبل
  التحقّق واحتساب (record) عند فشله حصراً — حتى لا يستطيع أحد قفل حساب
  المعلّم برشّ محاولات دخول. نحاكي كل تبعيات المسار ونتحقّق من الاستدعاءات
  لا من قاعدة بيانات حقيقية.
*/
const dbMocks = vi.hoisted(() => ({
  checkLoginRateLimit: vi.fn(async () => true),
  findTeacherByUsername: vi.fn(),
  recordFailedLoginAttempt: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const authMocks = vi.hoisted(() => ({
  setSessionCookie: vi.fn(),
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

const TEACHER = {
  id: 2,
  username: "u@x.com",
  passwordHash: "hash",
  teacherName: "معلّم",
  halaqahId: 1,
  halaqahName: "حلقة",
  role: "supervisor",
  emailVerified: true,
};

function loginReq(username: string, password: string): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

describe("POST /api/auth/login — حدّ البريد على الفشل فقط (منع قفل الحساب)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.checkLoginRateLimit.mockResolvedValue(true);
    rateLimitMocks.peekRateLimit.mockResolvedValue(true);
  });

  it("دخول ناجح: لا يُحتسب على حدّ البريد إطلاقاً — المحاولات الناجحة لا تستهلك الحصة", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue(TEACHER);
    authMocks.verifyPassword.mockReturnValue(true);

    const res = await POST(loginReq("u@x.com", "correct"));

    expect(res.status).toBe(200);
    expect((await res.json()).teacher.username).toBe("u@x.com");
    expect(rateLimitMocks.recordRateLimitHit).not.toHaveBeenCalled();
    expect(dbMocks.recordFailedLoginAttempt).not.toHaveBeenCalled();
    expect(authMocks.setSessionCookie).toHaveBeenCalledWith(TEACHER.id);
  });

  it("كلمة مرور خاطئة: تُحتسب على مفتاح بريد المستخدم نفسه", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue(TEACHER);
    authMocks.verifyPassword.mockReturnValue(false);

    const res = await POST(loginReq("U@X.com", "wrong"));

    expect(res.status).toBe(401);
    expect(rateLimitMocks.recordRateLimitHit).toHaveBeenCalledWith("login:email:u@x.com", 900);
  });

  it("بريد غير موجود: 404 + no_account (قرار المالك)، وتُحتسب المحاولة على مفتاحه", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue(null);

    const res = await POST(loginReq("ghost@x.com", "x"));
    const data = (await res.json()) as { error: string; code: string; email: string };

    expect(res.status).toBe(404);
    expect(data.code).toBe("no_account");
    expect(data.error).toBe("ما عندك حساب بهذا البريد");
    expect(data.email).toBe("ghost@x.com");
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
    expect(rateLimitMocks.recordRateLimitHit).toHaveBeenCalledWith("login:email:ghost@x.com", 900);
    expect(dbMocks.recordFailedLoginAttempt).toHaveBeenCalled();
  });

  it("١٠ محاولات فاشلة سابقاً (peek يمنع): 429 قبل أي بحث أو تحقّق، وبلا احتساب جديد", async () => {
    rateLimitMocks.peekRateLimit.mockResolvedValue(false);

    const res = await POST(loginReq("u@x.com", "correct"));

    expect(res.status).toBe(429);
    expect(rateLimitMocks.peekRateLimit).toHaveBeenCalledWith("login:email:u@x.com", 10, 900);
    expect(dbMocks.findTeacherByUsername).not.toHaveBeenCalled();
    expect(rateLimitMocks.recordRateLimitHit).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/login — الحساب الموقوف من مشرف الحلقة (STEP 60)", () => {
  const DEACTIVATED = { ...TEACHER, deactivatedAt: "2026-10-14T00:00:00.000Z" };

  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.checkLoginRateLimit.mockResolvedValue(true);
    rateLimitMocks.peekRateLimit.mockResolvedValue(true);
  });

  it("كلمة المرور صحيحة: 403 برسالة الإيقاف — لا احتساب فاشل ولا جلسة", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue(DEACTIVATED);
    authMocks.verifyPassword.mockReturnValue(true);

    const res = await POST(loginReq("u@x.com", "correct"));
    const data = (await res.json()) as { error: string };

    expect(res.status).toBe(403);
    expect(data.error).toBe("تم إيقاف حسابك من مشرف الحلقة");
    expect(rateLimitMocks.recordRateLimitHit).not.toHaveBeenCalled();
    expect(dbMocks.recordFailedLoginAttempt).not.toHaveBeenCalled();
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
  });

  it("كلمة المرور خاطئة: نفس 401 العامة — حالة الإيقاف لا تُكشف لمن لا يعرفها", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue(DEACTIVATED);
    authMocks.verifyPassword.mockReturnValue(false);

    const res = await POST(loginReq("u@x.com", "wrong"));
    const data = (await res.json()) as { error: string };

    expect(res.status).toBe(401);
    expect(data.error).toBe("البريد الإلكتروني أو كلمة المرور غير صحيحة");
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
  });
});
