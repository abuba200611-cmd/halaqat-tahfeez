import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "يجب على الطالب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ saveStudentPushSubscription: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

vi.mock("@/lib/push", () => ({ getVapidPublicKey: vi.fn() }));

const { POST } = await import("./route");

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/student/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/student/push/subscribe (STEP 54)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("يرفض بدون تسجيل دخول (401)، ولا يحفظ أي اشتراك", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    const res = await POST(postReq({ subscription: { endpoint: "e", keys: { p256dh: "p", auth: "a" } } }));
    expect(res.status).toBe(401);
    expect(dbMocks.saveStudentPushSubscription).not.toHaveBeenCalled();
  });

  it("student_id وteacher_id من جسم الطلب لا يُقبلان — الحفظ يستخدم قيم الجلسة حصراً حتى لو الجسم يدّعي طالباً آخر", async () => {
    authMocks.currentStudent.mockResolvedValue({ teacherId: 7, id: "real-student", name: "أحمد", halaqahName: "" });

    const res = await POST(
      postReq({
        // محاولة انتحال طالب آخر عبر الجسم — يجب أن تُتجاهَل بالكامل
        studentId: "victim-student",
        teacherId: 999,
        subscription: { endpoint: "device-1", keys: { p256dh: "p256", auth: "auth" } },
      }),
    );

    expect(res.status).toBe(200);
    expect(dbMocks.saveStudentPushSubscription).toHaveBeenCalledTimes(1);
    expect(dbMocks.saveStudentPushSubscription).toHaveBeenCalledWith(7, "real-student", {
      endpoint: "device-1",
      p256dh: "p256",
      auth: "auth",
    });
  });

  it("يرفض بيانات اشتراك ناقصة (400)", async () => {
    authMocks.currentStudent.mockResolvedValue({ teacherId: 7, id: "real-student", name: "أحمد", halaqahName: "" });
    const res = await POST(postReq({ subscription: { endpoint: "", keys: { p256dh: "", auth: "" } } }));
    expect(res.status).toBe(400);
    expect(dbMocks.saveStudentPushSubscription).not.toHaveBeenCalled();
  });
});
