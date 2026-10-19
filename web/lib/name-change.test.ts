import { beforeEach, describe, expect, it, vi } from "vitest";

const rate = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rate);

const imp = vi.hoisted(() => ({ guardImpersonation: vi.fn() }));
vi.mock("@/lib/dev-impersonation", () => imp);

const { handleNameChange } = await import("./name-change");

function req(body: unknown): Request {
  return new Request("http://localhost/api/x/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  });
}

describe("handleNameChange — تحقق الاسم وربطه بالجلسة", () => {
  const apply = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    rate.checkRateLimit.mockResolvedValue(true);
    imp.guardImpersonation.mockResolvedValue(null);
  });

  it("يقصّ الاسم ويحفظه عبر مُنفّذ الجلسة", async () => {
    const res = await handleNameChange(req({ name: "  سالم  " }), { scope: "teacher", sessionId: 9, apply });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: "سالم" });
    expect(apply).toHaveBeenCalledWith("سالم");
  });

  it("يتجاهل أي معرّف في الجسم: الحدّ يُحتسب على معرّف الجلسة لا على ما يرسله العميل", async () => {
    await handleNameChange(req({ name: "سالم", id: 1, teacherId: 1, parentId: 1 }), {
      scope: "teacher",
      sessionId: 9,
      apply,
    });
    expect(rate.checkRateLimit).toHaveBeenCalledWith("name:teacher:9", expect.any(Number), expect.any(Number));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith("سالم");
  });

  it("اسم غير صالح: 400 بلا كتابة", async () => {
    for (const name of ["أ", "", "ا".repeat(61), 5, undefined]) {
      const res = await handleNameChange(req({ name }), { scope: "parent", sessionId: 1, apply });
      expect(res.status).toBe(400);
    }
    expect(apply).not.toHaveBeenCalled();
  });

  it("تجاوز الحدّ: 429 بلا كتابة", async () => {
    rate.checkRateLimit.mockResolvedValueOnce(false);
    const res = await handleNameChange(req({ name: "سالم" }), { scope: "teacher", sessionId: 9, apply });
    expect(res.status).toBe(429);
    expect(apply).not.toHaveBeenCalled();
  });

  it("أثناء «عرض كـ»: ممنوع", async () => {
    imp.guardImpersonation.mockResolvedValue(Response.json({ error: "x" }, { status: 403 }));
    const res = await handleNameChange(req({ name: "سالم" }), { scope: "teacher", sessionId: 9, apply });
    expect(res.status).toBe(403);
    expect(apply).not.toHaveBeenCalled();
  });
});
