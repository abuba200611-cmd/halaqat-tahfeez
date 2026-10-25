import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  checkRegisterRateLimit: vi.fn(),
  findTeacherByUsername: vi.fn(),
  findTeacherById: vi.fn(),
  createHalaqahWithSupervisor: vi.fn(),
  joinHalaqahAsAssistant: vi.fn(),
  createEmailVerification: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const authMocks = vi.hoisted(() => ({
  hashPassword: vi.fn((password: string) => `hash(${password})`),
  setSessionCookie: vi.fn(),
}));
vi.mock("@/lib/auth", () => authMocks);

const mailMocks = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("@/lib/mail", () => mailMocks);
vi.mock("@/lib/privacy-consent", () => ({ recordPrivacyConsent: vi.fn(async () => undefined) }));

const { POST } = await import("./route");

const NEW_TEACHER = {
  id: 9,
  username: "new@example.com",
  teacherName: "جديد",
  halaqahId: 3,
  halaqahName: "حلقة جديدة",
  role: "supervisor" as const,
  emailVerified: false,
  sessionVersion: 0,
};

function registerReq(overrides: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "someone@example.com",
      password: "password-123",
      teacherName: "اسم",
      halaqahName: "حلقة",
      privacyConsent: true,
      ...overrides,
    }),
  });
}

describe("POST /api/auth/register — موافقة سياسة الخصوصية", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.checkRegisterRateLimit.mockResolvedValue(true);
    dbMocks.findTeacherByUsername.mockResolvedValue(null);
  });

  it("بلا موافقة صريحة: 400 ولا إنشاء حساب ولا جلسة", async () => {
    for (const privacyConsent of [undefined, false, "true", 1]) {
      const res = await POST(registerReq({ privacyConsent }));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { field?: string }).field).toBe("privacyConsent");
    }
    expect(dbMocks.createHalaqahWithSupervisor).not.toHaveBeenCalled();
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/register — البريد المسجّل مسبقاً: خطأ واضح (قرار المالك)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.checkRegisterRateLimit.mockResolvedValue(true);
    dbMocks.createHalaqahWithSupervisor.mockResolvedValue(9);
    dbMocks.createEmailVerification.mockResolvedValue("tok");
    dbMocks.findTeacherById.mockResolvedValue(NEW_TEACHER);
    mailMocks.sendMail.mockResolvedValue(undefined);
  });

  it("بريد جديد: ينشئ الحساب ويجلس ويرسل رسالة التفعيل — المسار القائم كما هو", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue(null);

    const res = await POST(registerReq());
    const data = (await res.json()) as { teacher?: unknown; message?: string };

    expect(res.status).toBe(200);
    expect(data.teacher).toEqual(NEW_TEACHER);
    expect(authMocks.setSessionCookie).toHaveBeenCalledExactlyOnceWith(9);
    expect(mailMocks.sendMail).toHaveBeenCalledOnce();
  });

  it("بريد مسجّل مسبقاً: 409 + account_exists — بلا جلسة أو إنشاء أو بريد", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue({ id: 1 });

    const res = await POST(registerReq());
    const data = (await res.json()) as { teacher?: unknown; code?: string; error?: string };

    expect(res.status).toBe(409);
    expect(data.code).toBe("account_exists");
    expect(data.error).toContain("مسجّل مسبقاً");
    expect(data.teacher).toBeUndefined();
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
    expect(mailMocks.sendMail).not.toHaveBeenCalled();
    expect(dbMocks.createHalaqahWithSupervisor).not.toHaveBeenCalled();
  });

  it("إنشاء جديد: يرجع رسالة نجاح", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue(null);
    const res = await POST(registerReq());
    const data = (await res.json()) as { message?: string };
    expect(res.status).toBe(200);
    expect(data.message).toBeTruthy();
  });
});
