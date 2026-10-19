import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  دخول جوجل: حساب موجود → جلسة مباشرة؛ بريد بلا حساب → /signup بتسليم
  موقّع (لا إنشاء صامت)؛ وفحص state الـCSRF يبقى كما هو.
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
  findTeacherIdByGoogleEmail: vi.fn(),
  sessionSecret: async () => "test-secret-not-for-production",
}));
vi.mock("@/lib/db", () => dbMocks);

const authMocks = vi.hoisted(() => ({ setSessionCookie: vi.fn() }));
vi.mock("@/lib/auth", () => authMocks);

vi.mock("@/lib/activity", () => ({ recordLogin: vi.fn() }));

const googleMocks = vi.hoisted(() => ({ exchangeGoogleCode: vi.fn() }));
vi.mock("@/lib/google-auth", () => googleMocks);

const { GET } = await import("./route");
const { readGoogleHandoff } = await import("@/lib/google-handoff");

function req(state = "s1"): Request {
  return new Request(`http://localhost/api/auth/google/callback?code=abc&state=${state}`);
}

describe("GET /api/auth/google/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jar.store.clear();
    jar.store.set("google_oauth_state", "s1");
    googleMocks.exchangeGoogleCode.mockResolvedValue({ sub: "g1", email: "x@example.com", name: "اسم" });
  });

  it("بريد بلا حساب: تحويل لـ/signup بتسليم موقّع صالح + mos_intro، بلا جلسة ولا إنشاء", async () => {
    dbMocks.findTeacherIdByGoogleEmail.mockResolvedValue(null);

    const res = await GET(req());

    expect(res.headers.get("location")).toBe("http://localhost/signup?google=1");
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
    expect(jar.store.get("mos_intro")).toBe("1");
    expect(await readGoogleHandoff()).toEqual({ email: "x@example.com", name: "اسم" });
  });

  it("بريد له حساب: جلسة مباشرة وتحويل للرئيسية بلا تسليم", async () => {
    dbMocks.findTeacherIdByGoogleEmail.mockResolvedValue(5);

    const res = await GET(req());

    expect(authMocks.setSessionCookie).toHaveBeenCalledWith(5);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    expect(jar.store.has("google_handoff")).toBe(false);
  });

  it("state لا يطابق: رفض (CSRF) بلا أي تبادل مع جوجل", async () => {
    const res = await GET(req("tampered"));

    expect(res.headers.get("location")).toContain("googleError=");
    expect(googleMocks.exchangeGoogleCode).not.toHaveBeenCalled();
    expect(authMocks.setSessionCookie).not.toHaveBeenCalled();
  });
});
