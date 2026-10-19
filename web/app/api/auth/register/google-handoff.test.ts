import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  التسجيل بعد جوجل: البريد من الكوكي الموقّع حصراً (يُهمَل ما يرسله العميل)،
  ورفض التسليم المعبوث به أو المنتهي، وبريد قائم → 409.
*/

process.env.SESSION_SECRET = "test-secret-not-for-production";

const jar = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.store.has(name) ? { value: jar.store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      jar.store.set(name, value);
    },
    delete: (name: string) => {
      jar.store.delete(name);
    },
  }),
}));

const dbMocks = vi.hoisted(() => ({
  checkRegisterRateLimit: vi.fn(),
  findTeacherByUsername: vi.fn(),
  findTeacherById: vi.fn(),
  createHalaqahWithSupervisor: vi.fn(),
  joinHalaqahAsAssistant: vi.fn(),
  createEmailVerification: vi.fn(),
  sessionSecret: async () => "test-secret-not-for-production",
}));
vi.mock("@/lib/db", () => dbMocks);

const authMocks = vi.hoisted(() => ({ hashPassword: vi.fn(), setSessionCookie: vi.fn() }));
vi.mock("@/lib/auth", () => authMocks);
vi.mock("@/lib/activity", () => ({ recordLogin: vi.fn() }));
const mailMocks = vi.hoisted(() => ({ sendMail: vi.fn() }));
vi.mock("@/lib/mail", () => mailMocks);

const { POST } = await import("./route");
const { signGoogleHandoff } = await import("@/lib/google-handoff");

const SECRET = "test-secret-not-for-production";

function req(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register — googleHandoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jar.store.clear();
    dbMocks.checkRegisterRateLimit.mockResolvedValue(true);
    dbMocks.findTeacherByUsername.mockResolvedValue(null);
    dbMocks.createHalaqahWithSupervisor.mockResolvedValue(11);
    dbMocks.findTeacherById.mockResolvedValue({ id: 11 });
  });

  it("تسليم صالح: ينشئ بالبريد الموقّع (لا بما أرسله العميل)، موثّقاً، بلا رسالة تفعيل", async () => {
    jar.store.set("google_handoff", signGoogleHandoff({ email: "g@example.com", name: "جوجل" }, SECRET));

    const res = await POST(req({ googleHandoff: true, username: "victim@example.com", halaqahName: "حلقة" }));

    expect(res.status).toBe(200);
    expect(dbMocks.createHalaqahWithSupervisor).toHaveBeenCalledWith(
      "g@example.com",
      expect.any(String),
      "حلقة",
      true,
      "جوجل",
    );
    expect(authMocks.setSessionCookie).toHaveBeenCalledWith(11);
    expect(mailMocks.sendMail).not.toHaveBeenCalled();
    expect(jar.store.has("google_handoff")).toBe(false);
  });

  it("بلا كوكي تسليم: مرفوض (لا يكفي ادّعاء العميل)", async () => {
    const res = await POST(req({ googleHandoff: true, username: "victim@example.com", halaqahName: "حلقة" }));

    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("handoff_expired");
    expect(dbMocks.createHalaqahWithSupervisor).not.toHaveBeenCalled();
  });

  it("تسليم معبوث به أو منتهٍ: مرفوض", async () => {
    const good = signGoogleHandoff({ email: "g@example.com", name: "x" }, SECRET);
    jar.store.set("google_handoff", `${good}x`);
    expect((await POST(req({ googleHandoff: true, halaqahName: "ح" }))).status).toBe(400);

    jar.store.set("google_handoff", signGoogleHandoff({ email: "g@example.com", name: "x" }, SECRET, 1));
    expect((await POST(req({ googleHandoff: true, halaqahName: "ح" }))).status).toBe(400);
    expect(dbMocks.createHalaqahWithSupervisor).not.toHaveBeenCalled();
  });

  it("بريد التسليم له حساب بالفعل: 409 account_exists", async () => {
    jar.store.set("google_handoff", signGoogleHandoff({ email: "g@example.com", name: "x" }, SECRET));
    dbMocks.findTeacherByUsername.mockResolvedValue({ id: 3 });

    const res = await POST(req({ googleHandoff: true, halaqahName: "ح" }));

    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("account_exists");
    expect(dbMocks.createHalaqahWithSupervisor).not.toHaveBeenCalled();
  });

  it("بلا اسم حلقة ولا رمز دعوة: يطلب اسم الحلقة", async () => {
    jar.store.set("google_handoff", signGoogleHandoff({ email: "g@example.com", name: "x" }, SECRET));
    const res = await POST(req({ googleHandoff: true }));
    expect(res.status).toBe(400);
    expect(dbMocks.createHalaqahWithSupervisor).not.toHaveBeenCalled();
  });
});
