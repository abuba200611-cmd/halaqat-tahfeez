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
      ...overrides,
    }),
  });
}

describe("POST /api/auth/register — ردّ موحّد لا يكشف وجود البريد (الدفعة الأمنية ب)", () => {
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

  it("بريد مسجّل مسبقاً: نفس الحالة (200) ونفس الرسالة تماماً — بلا جلسة أو إنشاء أو بريد", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue({ id: 1 });

    const res = await POST(registerReq());
    const data = (await res.json()) as { teacher?: unknown; message?: string };

    expect(res.status).toBe(200);
    expect(data.message).toBe("إذا كان البريد صالحاً ستصلك رسالة للتفعيل");
    expect(data.teacher).toBeUndefined();
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
    expect(mailMocks.sendMail).not.toHaveBeenCalled();
    expect(dbMocks.createHalaqahWithSupervisor).not.toHaveBeenCalled();
  });

  it("الرسالة نفسها تظهر في حالة الإنشاء أيضاً — الحالتان غير متمايزتين بالنص", async () => {
    dbMocks.findTeacherByUsername.mockResolvedValue(null);
    const res = await POST(registerReq());
    const data = (await res.json()) as { message?: string };
    expect(data.message).toBe("إذا كان البريد صالحاً ستصلك رسالة للتفعيل");
  });
});
