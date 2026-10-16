import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  حارس المسارات الهدّامة أثناء «عرض كـ» (imp=1): حذف الطالب وتغيير
  كلمة المرور يُرفضان قبل أي كتابة، ويمرّان طبيعياً بلا انتحال.
*/

const blocked = Response.json({ error: "غير متاح أثناء «عرض كـ»" }, { status: 403 });

const mocks = vi.hoisted(() => ({
  guardImpersonation: vi.fn(),
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
  deleteStudent: vi.fn(),
  consumePasswordReset: vi.fn(),
  updateTeacherPassword: vi.fn(),
}));

vi.mock("@/lib/dev-impersonation", () => ({ guardImpersonation: mocks.guardImpersonation }));
vi.mock("@/lib/auth", () => ({
  currentTeacher: mocks.currentTeacher,
  unauthorized: mocks.unauthorized,
  hashPassword: (p: string) => `hash:${p}`,
}));
vi.mock("@/lib/db", () => ({
  deleteStudent: mocks.deleteStudent,
  consumePasswordReset: mocks.consumePasswordReset,
  updateTeacherPassword: mocks.updateTeacherPassword,
}));

const { DELETE } = await import("@/app/api/students/route");
const { POST: resetPasswordPOST } = await import("@/app/api/auth/reset-password/route");

const TEACHER = { id: 1, halaqahId: 7, role: "supervisor" as const };

function deleteRequest(body: unknown): Request {
  return new Request("http://localhost/api/students", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.guardImpersonation.mockResolvedValue(null);
  mocks.currentTeacher.mockResolvedValue(TEACHER);
  mocks.deleteStudent.mockResolvedValue(true);
});

describe("حذف طالب (DELETE /api/students) مع imp=1", () => {
  it("يُحجب 403 قبل أي حذف", async () => {
    mocks.guardImpersonation.mockResolvedValue(blocked);
    const res = await DELETE(deleteRequest({ id: "s1" }));
    expect(res.status).toBe(403);
    expect(mocks.deleteStudent).not.toHaveBeenCalled();
  });

  it("بلا انتحال: يعمل كما كان", async () => {
    const res = await DELETE(deleteRequest({ id: "s1" }));
    expect(res.status).toBe(200);
    expect(mocks.deleteStudent).toHaveBeenCalledWith(7, "s1");
  });
});

describe("تغيير كلمة المرور (POST /api/auth/reset-password) مع imp=1", () => {
  it("يُحجب 403 قبل استهلاك الرمز", async () => {
    mocks.guardImpersonation.mockResolvedValue(blocked);
    const res = await resetPasswordPOST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok", password: "12345678" }),
      }),
    );
    expect(res.status).toBe(403);
    expect(mocks.consumePasswordReset).not.toHaveBeenCalled();
    expect(mocks.updateTeacherPassword).not.toHaveBeenCalled();
  });

  it("بلا انتحال: يعمل كما كان", async () => {
    mocks.consumePasswordReset.mockResolvedValue(9);
    const res = await resetPasswordPOST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "tok", password: "12345678" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.updateTeacherPassword).toHaveBeenCalledWith(9, "hash:12345678");
  });
});
