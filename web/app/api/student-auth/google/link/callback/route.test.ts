import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  FIX (دخول الطالب بـGoogle): mode=login مضاف لمسار STEP 6B
  (/link/start + /link/callback) بدل مسار callback جديد — كوكي الـstate
  نفسها تحمل mode موقّعاً بها لا كمعامل منفصل بالرابط، فالاختبار الحاسم
  هنا هو إثبات أن تعديل الرابط يدوياً (?mode=login) لا يغيّر أي سلوك ما
  لم يُحفظ mode فعلاً بالكوكي وقت /start (consumeStudentGoogleLinkState).
*/

process.env.SESSION_SECRET = "test-secret-not-for-production";

const cookieJar = vi.hoisted(() => ({ store: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieJar.store.has(name) ? { value: cookieJar.store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.store.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.store.delete(name);
    },
  }),
}));

const dbMocks = vi.hoisted(() => ({
  findGoogleStudentAccount: vi.fn(),
  // student-google-auth.ts يستورد sessionSecret من ./db لتوقيع توكنات الـpending
  sessionSecret: async () => "test-secret-not-for-production",
}));
vi.mock("@/lib/db", () => dbMocks);

const googleAuthMocks = vi.hoisted(() => ({ exchangeGoogleCode: vi.fn() }));
vi.mock("@/lib/google-auth", () => googleAuthMocks);

const authMocks = vi.hoisted(() => ({ setStudentSessionCookie: vi.fn() }));
vi.mock("@/lib/auth", () => authMocks);

const { createStudentGoogleLinkState } = await import("@/lib/student-google-auth");
const { GET } = await import("./route");

const FAKE_PROFILE = { sub: "google-sub-1", email: "student@example.com", name: "طالب" };

function callbackReq(state: string, extra = ""): Request {
  return new Request(`http://localhost/api/student-auth/google/link/callback?code=abc123&state=${state}${extra}`);
}

function location(res: Response): string {
  return new URL(res.headers.get("location")!).pathname + new URL(res.headers.get("location")!).search;
}

describe("GET /api/student-auth/google/link/callback — mode=login (FIX دخول الطالب بـGoogle)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieJar.store.clear();
    googleAuthMocks.exchangeGoogleCode.mockResolvedValue(FAKE_PROFILE);
  });

  it("mode=login + حساب مربوط: يدخل مباشرة إلى /student", async () => {
    const state = await createStudentGoogleLinkState("login");
    dbMocks.findGoogleStudentAccount.mockResolvedValue({ halaqahId: 7, studentId: "s1" });

    const res = await GET(callbackReq(state));

    expect(location(res)).toBe("/student");
    expect(authMocks.setStudentSessionCookie).toHaveBeenCalledWith(7, "s1");
  });

  it("mode=login + حساب غير مربوط: رسالة واضحة بلا أي كتابة أو ربط", async () => {
    const state = await createStudentGoogleLinkState("login");
    dbMocks.findGoogleStudentAccount.mockResolvedValue(null);

    const res = await GET(callbackReq(state));

    expect(location(res)).toBe("/student?googleError=not_linked");
    expect(authMocks.setStudentSessionCookie).not.toHaveBeenCalled();
    // لا كوكي pending للربط تُحفظ — لا خطوة تالية لإكمالها إطلاقاً
    expect(cookieJar.store.has("student_google_link_pending")).toBe(false);
  });

  it("بلا mode (STEP 6B الأصلي) + حساب مربوط: نفس الدخول المباشر", async () => {
    const state = await createStudentGoogleLinkState();
    dbMocks.findGoogleStudentAccount.mockResolvedValue({ halaqahId: 3, studentId: "s9" });

    const res = await GET(callbackReq(state));

    expect(location(res)).toBe("/student");
    expect(authMocks.setStudentSessionCookie).toHaveBeenCalledWith(3, "s9");
  });

  it("بلا mode (STEP 6B الأصلي) + حساب غير مربوط: يبقى على مسار رمز الربط كالسابق تماماً", async () => {
    const state = await createStudentGoogleLinkState();
    dbMocks.findGoogleStudentAccount.mockResolvedValue(null);

    const res = await GET(callbackReq(state));

    expect(location(res)).toBe("/student-link?step=code");
    expect(authMocks.setStudentSessionCookie).not.toHaveBeenCalled();
    expect(cookieJar.store.has("student_google_link_pending")).toBe(true);
  });

  it("التلاعب بـ mode من رابط الطلب نفسه لا يغيّر شيئاً — القيمة الوحيدة المعتمدة هي ما حُفظ بالكوكي وقت /start", async () => {
    // بدأ المسار بدون mode=login (أي STEP 6B العادي)، ثم أُضيف mode=login
    // يدوياً لرابط الـcallback — يجب أن يبقى السلوك سلوك "link" الأصلي
    const state = await createStudentGoogleLinkState("link");
    dbMocks.findGoogleStudentAccount.mockResolvedValue(null);

    const res = await GET(callbackReq(state, "&mode=login"));

    expect(location(res)).toBe("/student-link?step=code");
  });

  it("والعكس: state بدأ بـmode=login، وإضافة mode=link يدوياً بالرابط لا يُعيده لمسار رمز الربط", async () => {
    const state = await createStudentGoogleLinkState("login");
    dbMocks.findGoogleStudentAccount.mockResolvedValue(null);

    const res = await GET(callbackReq(state, "&mode=link"));

    expect(location(res)).toBe("/student?googleError=not_linked");
  });

  it("state غير صالح/مفقود: خطأ عام، ولا يُستدعى أي شيء من جوجل أو قاعدة البيانات", async () => {
    const res = await GET(new Request("http://localhost/api/student-auth/google/link/callback?code=abc123&state=wrong"));
    const url = new URL(res.headers.get("location")!);

    expect(url.pathname).toBe("/student-link");
    expect(url.searchParams.get("error")).toBeTruthy();
    expect(googleAuthMocks.exchangeGoogleCode).not.toHaveBeenCalled();
    expect(dbMocks.findGoogleStudentAccount).not.toHaveBeenCalled();
  });
});
