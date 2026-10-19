import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  setSessionCookie: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, ...authMocks };
});

const dbMocks = vi.hoisted(() => ({ teacherPasswordHash: vi.fn(), updateTeacherPassword: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const rate = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "x" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rate);
vi.mock("@/lib/dev-impersonation", () => ({ guardImpersonation: vi.fn(async () => null) }));

const { hashPassword } = await import("@/lib/auth");
const { POST } = await import("./route");

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const BODY = { currentPassword: "old-password-1", newPassword: "new-password-2", confirmPassword: "new-password-2" };

describe("POST /api/auth/change-password (معلّم)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rate.checkRateLimit.mockResolvedValue(true);
    authMocks.currentTeacher.mockResolvedValue({ id: 4 });
    dbMocks.teacherPasswordHash.mockResolvedValue(hashPassword("old-password-1"));
  });

  it("غير المسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await POST(postReq(BODY))).status).toBe(401);
  });

  it("النجاح: يحدّث كلمة مرور معلّم الجلسة (فيرتفع session_version كما بـ«إنهاء كل الجلسات») ويعيد إصدار كوكي هذا الجهاز", async () => {
    const res = await POST(postReq(BODY));
    expect(res.status).toBe(200);
    expect(dbMocks.updateTeacherPassword).toHaveBeenCalledWith(4, expect.stringContaining(":"));
    expect(authMocks.setSessionCookie).toHaveBeenCalledWith(4);
  });

  it("الحالية خاطئة: 403 بلا تحديث ولا كوكي", async () => {
    const res = await POST(postReq({ ...BODY, currentPassword: "wrong-wrong" }));
    expect(res.status).toBe(403);
    expect(dbMocks.updateTeacherPassword).not.toHaveBeenCalled();
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
  });
});
