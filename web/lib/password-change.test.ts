import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const rate = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rate);

const imp = vi.hoisted(() => ({ guardImpersonation: vi.fn() }));
vi.mock("@/lib/dev-impersonation", () => imp);

const audit = vi.hoisted(() => ({ logSecurityEvent: vi.fn() }));
vi.mock("@/lib/audit-log", () => audit);

// hashPassword / verifyPassword الحقيقيان من lib/auth (scrypt) — لا محاكاة لهما
const { hashPassword, verifyPassword } = await import("./auth");
const { handlePasswordChange, passwordInfoResponse } = await import("./password-change");

function req(body: unknown): Request {
  return new Request("http://localhost/api/x/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9" },
    body: JSON.stringify(body),
  });
}

const BODY = { currentPassword: "old-password-1", newPassword: "new-password-2", confirmPassword: "new-password-2" };

describe("handlePasswordChange", () => {
  const apply = vi.fn();
  let stored: string | null;
  const target = () => ({ scope: "teacher", sessionId: 5, loadHash: async () => stored, apply });

  beforeEach(() => {
    vi.clearAllMocks();
    rate.checkRateLimit.mockResolvedValue(true);
    imp.guardImpersonation.mockResolvedValue(null);
    stored = hashPassword("old-password-1");
  });

  it("الحالية خاطئة: 403 ولا يُحدَّث شيء", async () => {
    const res = await handlePasswordChange(req({ ...BODY, currentPassword: "not-the-password" }), target());
    expect(res.status).toBe(403);
    expect(apply).not.toHaveBeenCalled();
  });

  it("النجاح: يمرّر بصمة جديدة تتحقق بالكلمة الجديدة لا القديمة", async () => {
    const res = await handlePasswordChange(req(BODY), target());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(apply).toHaveBeenCalledTimes(1);
    const newHash = apply.mock.calls[0][0] as string;
    expect(verifyPassword("new-password-2", newHash)).toBe(true);
    expect(verifyPassword("old-password-1", newHash)).toBe(false);
  });

  it("كلمة جديدة أقصر من ٨ أو تأكيد غير مطابق: 400 قبل أي فحص للبصمة", async () => {
    const short = await handlePasswordChange(
      req({ ...BODY, newPassword: "short", confirmPassword: "short" }),
      target(),
    );
    expect(short.status).toBe(400);
    const mismatch = await handlePasswordChange(req({ ...BODY, confirmPassword: "other-password" }), target());
    expect(mismatch.status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });

  it("تجاوز حدّ الجلسة أو الـIP: 429", async () => {
    rate.checkRateLimit.mockResolvedValueOnce(false);
    expect((await handlePasswordChange(req(BODY), target())).status).toBe(429);

    rate.checkRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect((await handlePasswordChange(req(BODY), target())).status).toBe(429);
    expect(apply).not.toHaveBeenCalled();
  });

  it("الحدّ يُحتسب لكل جلسة ولكل IP", async () => {
    await handlePasswordChange(req(BODY), target());
    const keys = rate.checkRateLimit.mock.calls.map((c) => c[0]);
    expect(keys).toContain("pwchange:teacher:5");
    expect(keys).toContain("pwchange-ip:9.9.9.9");
  });

  it("حساب جوجل فقط (بصمة بلا ':'): 400 برمز google_only ولا تحديث", async () => {
    stored = "f".repeat(64);
    const res = await handlePasswordChange(req(BODY), target());
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("google_only");
    expect(apply).not.toHaveBeenCalled();
  });

  it("أثناء «عرض كـ»: ممنوع", async () => {
    imp.guardImpersonation.mockResolvedValue(Response.json({ error: "x" }, { status: 403 }));
    expect((await handlePasswordChange(req(BODY), target())).status).toBe(403);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("passwordInfoResponse", () => {
  it("يفرّق بين حساب بكلمة مرور وحساب جوجل فقط", async () => {
    expect(await passwordInfoResponse(hashPassword("x-password-1")).json()).toEqual({ hasPassword: true });
    expect(await passwordInfoResponse("a".repeat(64)).json()).toEqual({ hasPassword: false });
    expect(await passwordInfoResponse(null).json()).toEqual({ hasPassword: false });
  });
});
