import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ updateTeacherName: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const rate = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "x" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rate);
vi.mock("@/lib/dev-impersonation", () => ({ guardImpersonation: vi.fn(async () => null) }));

const { PATCH } = await import("./route");

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/teacher/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/teacher/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rate.checkRateLimit.mockResolvedValue(true);
  });

  it("غير المسجّل: 401 بلا كتابة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await PATCH(patchReq({ name: "سالم" }))).status).toBe(401);
    expect(dbMocks.updateTeacherName).not.toHaveBeenCalled();
  });

  it("يعدّل اسم معلّم الجلسة حصراً حتى لو أرسل العميل معرّفاً آخر", async () => {
    authMocks.currentTeacher.mockResolvedValue({ id: 2, halaqahId: 7 });
    const res = await PATCH(patchReq({ name: " سالم ", id: 99, teacherId: 99 }));
    expect(res.status).toBe(200);
    expect(dbMocks.updateTeacherName).toHaveBeenCalledWith(2, "سالم");
  });

  it("اسم قصير: 400", async () => {
    authMocks.currentTeacher.mockResolvedValue({ id: 2, halaqahId: 7 });
    expect((await PATCH(patchReq({ name: "س" }))).status).toBe(400);
    expect(dbMocks.updateTeacherName).not.toHaveBeenCalled();
  });
});
