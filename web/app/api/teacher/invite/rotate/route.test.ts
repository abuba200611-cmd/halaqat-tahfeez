import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ rotateHalaqahInviteCode: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const { POST } = await import("./route");

function teacherWith(role: "supervisor" | "assistant") {
  return {
    id: 42,
    username: "t@example.com",
    teacherName: "معلّم",
    halaqahId: 7,
    halaqahName: "الحلقة",
    role,
    emailVerified: true,
    sessionVersion: 0,
  };
}

describe("POST /api/teacher/invite/rotate — تدوير رمز دعوة الطلاب (الدفعة الأمنية ب)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("بلا جلسة → 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/teacher/invite/rotate", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(dbMocks.rotateHalaqahInviteCode).not.toHaveBeenCalled();
  });

  it("مساعد (غير المالك) → 403 بلا تدوير", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacherWith("assistant"));
    const res = await POST(new Request("http://localhost/api/teacher/invite/rotate", { method: "POST" }));
    expect(res.status).toBe(403);
    expect(dbMocks.rotateHalaqahInviteCode).not.toHaveBeenCalled();
  });

  it("المشرف (المالك) → رمز جديد من مولّد الرموز نفسه، والرابط الجديد يُرجَع", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacherWith("supervisor"));
    dbMocks.rotateHalaqahInviteCode.mockResolvedValue("abcdef1234");

    const res = await POST(new Request("http://localhost/api/teacher/invite/rotate", { method: "POST" }));
    const data = (await res.json()) as { code?: string; link?: string };

    expect(res.status).toBe(200);
    expect(dbMocks.rotateHalaqahInviteCode).toHaveBeenCalledExactlyOnceWith(7);
    expect(data.code).toBe("abcdef1234");
    expect(data.link).toBe("http://localhost/student-join?invite=abcdef1234");
  });
});
