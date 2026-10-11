import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
  clearSessionCookie: vi.fn(),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ bumpTeacherSessionVersion: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const { POST } = await import("./route");

const FAKE_TEACHER = {
  id: 42,
  username: "t@example.com",
  teacherName: "معلّم",
  halaqahId: 7,
  halaqahName: "الحلقة",
  role: "supervisor" as const,
  emailVerified: true,
  sessionVersion: 0,
};

describe("POST /api/auth/logout-all — إنهاء كل الجلسات (الدفعة الأمنية ب)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("بلا جلسة → 401 بلا رفع نسخة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);

    const res = await POST();
    expect(res.status).toBe(401);
    expect(dbMocks.bumpTeacherSessionVersion).not.toHaveBeenCalled();
  });

  it("بجلسة صالحة → يرفع نسخة حساب المعلّم ويمسح كوكيز الجلسة الحالية", async () => {
    authMocks.currentTeacher.mockResolvedValue(FAKE_TEACHER);
    dbMocks.bumpTeacherSessionVersion.mockResolvedValue(undefined);

    const res = await POST();
    expect(res.status).toBe(200);
    expect(dbMocks.bumpTeacherSessionVersion).toHaveBeenCalledExactlyOnceWith(42);
    expect(authMocks.clearSessionCookie).toHaveBeenCalledOnce();
  });
});
