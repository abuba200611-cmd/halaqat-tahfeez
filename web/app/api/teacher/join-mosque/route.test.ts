import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ halaqahInviteCode: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

const { GET, POST } = await import("./route");

const SUPERVISOR = { id: 2, halaqahId: 7, role: "supervisor" as const, teacherName: "أحمد", halaqahName: "حلقة الفجر" };
const ASSISTANT = { ...SUPERVISOR, id: 3, role: "assistant" as const };

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/teacher/join-mosque", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(code = "abc"): Request {
  return new Request(`http://localhost/api/teacher/join-mosque?code=${code}`);
}

function mosqueResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  process.env.LINK_SECRET = "shared-secret";
  delete process.env.MOSQUE_APP_URL;
  rateMocks.checkRateLimit.mockResolvedValue(true);
  dbMocks.halaqahInviteCode.mockResolvedValue("INVITE1234");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/teacher/join-mosque", () => {
  it("غير مسجّل: 401 بلا أي نداء للجامع", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await POST(postReq({ code: "abc" }))).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("المساعد: 403 بلا نداء ولا استهلاك من حدّ المعدّل", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    const res = await POST(postReq({ code: "abc" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("مشرف الحلقة");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(rateMocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("تجاوز حدّ المعدّل (١٠ بالساعة لكل معلّم): 429", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    rateMocks.checkRateLimit.mockResolvedValue(false);
    expect((await POST(postReq({ code: "abc" }))).status).toBe(429);
    expect(rateMocks.checkRateLimit).toHaveBeenCalledWith("mosque-join:2", 10, 3600);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("رمز ناقص: 400", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    expect((await POST(postReq({}))).status).toBe(400);
  });

  it("المشرف: يرسل رمز دعوة حلقته وسرّ الربط لعنوان الجامع الافتراضي", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    fetchMock.mockResolvedValue(mosqueResponse(200, { ok: true, alreadyJoined: false, mosqueName: "جامع النور" }));

    const res = await POST(postReq({ code: "abc" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyJoined: false, mosqueName: "جامع النور" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://masjid-idara.vercel.app/api/link/join-mosque");
    expect((init.headers as Record<string, string>)["x-link-secret"]).toBe("shared-secret");
    expect(JSON.parse(init.body as string)).toEqual({
      code: "abc",
      halaqahInviteCode: "INVITE1234",
      halaqahName: "حلقة الفجر",
      teacherName: "أحمد",
    });
  });

  it("MOSQUE_APP_URL يغيّر العنوان (بلا شرطة أخيرة)", async () => {
    process.env.MOSQUE_APP_URL = "https://mosque.example/";
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    fetchMock.mockResolvedValue(mosqueResponse(200, { ok: true, alreadyJoined: true, mosqueName: "م" }));
    await POST(postReq({ code: "abc" }));
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe("https://mosque.example/api/link/join-mosque");
  });

  it("إعادة الانضمام: يمرّر alreadyJoined", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    fetchMock.mockResolvedValue(mosqueResponse(200, { ok: true, alreadyJoined: true, mosqueName: "جامع النور" }));
    expect(await (await POST(postReq({ code: "abc" }))).json()).toMatchObject({ alreadyJoined: true });
  });

  it("حلقة بجامع آخر: 409 برسالة الجامع", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    fetchMock.mockResolvedValue(mosqueResponse(409, { error: "هذي الحلقة مضافة أصلاً لجامع آخر" }));
    const res = await POST(postReq({ code: "abc" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("جامع آخر");
  });

  it("رمز جامع غير صحيح: 404؛ ونظام الجامع معطّل: 502", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    fetchMock.mockResolvedValueOnce(mosqueResponse(404, { error: "رابط الانضمام غير صحيح" }));
    expect((await POST(postReq({ code: "bad" }))).status).toBe(404);
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect((await POST(postReq({ code: "abc" }))).status).toBe(502);
  });
});

describe("GET /api/teacher/join-mosque", () => {
  it("غير مسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await GET(getReq())).status).toBe(401);
  });

  it("المساعد: يرجع دوره فقط بلا نداء للجامع", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    const res = await GET(getReq());
    expect(await res.json()).toEqual({ role: "assistant", halaqahName: "حلقة الفجر" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("المشرف: اسم الجامع ومدينته، ورمز مجهول = 404", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    fetchMock.mockResolvedValueOnce(mosqueResponse(200, { mosqueName: "جامع النور", city: "جدة" }));
    expect(await (await GET(getReq())).json()).toMatchObject({ mosqueName: "جامع النور", city: "جدة", role: "supervisor" });
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].headers).toMatchObject({ "x-link-secret": "shared-secret" });

    fetchMock.mockResolvedValueOnce(mosqueResponse(404, { error: "x" }));
    expect((await GET(getReq("nope"))).status).toBe(404);
  });
});
