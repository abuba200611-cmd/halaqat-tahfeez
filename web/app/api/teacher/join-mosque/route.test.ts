import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  انضمام الحلقة لجامع صار داخل التطبيق (دمج المنصة M2): لا نداء لخادم الجامع
  ولا LINK_SECRET — المسار يقرأ الجامع ويضبط halaqahs.mosque_id مباشرة من
  قاعدة الحلقات نفسها عبر lib/mosque/db.
*/

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const mosqueDbMocks = vi.hoisted(() => ({
  findMosqueByTeacherJoinCode: vi.fn(),
  joinHalaqahToMosqueByCode: vi.fn(),
}));
vi.mock("@/lib/mosque/db", () => mosqueDbMocks);

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

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  rateMocks.checkRateLimit.mockResolvedValue(true);
});

describe("POST /api/teacher/join-mosque", () => {
  it("غير مسجّل: 401 بلا أي كتابة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await POST(postReq({ code: "abc" }))).status).toBe(401);
    expect(mosqueDbMocks.joinHalaqahToMosqueByCode).not.toHaveBeenCalled();
  });

  it("المساعد: 403 بلا كتابة ولا استهلاك من حدّ المعدّل", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    const res = await POST(postReq({ code: "abc" }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: string }).error).toContain("مشرف الحلقة");
    expect(mosqueDbMocks.joinHalaqahToMosqueByCode).not.toHaveBeenCalled();
    expect(rateMocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("تجاوز حدّ المعدّل (١٠ بالساعة لكل معلّم): 429", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    rateMocks.checkRateLimit.mockResolvedValue(false);
    expect((await POST(postReq({ code: "abc" }))).status).toBe(429);
    expect(rateMocks.checkRateLimit).toHaveBeenCalledWith("mosque-join:2", 10, 3600);
    expect(mosqueDbMocks.joinHalaqahToMosqueByCode).not.toHaveBeenCalled();
  });

  it("رمز ناقص: 400", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    expect((await POST(postReq({}))).status).toBe(400);
  });

  it("المشرف: يربط حلقة جلسته مباشرة بجامع الرمز، بلا أي نداء خارجي", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    mosqueDbMocks.joinHalaqahToMosqueByCode.mockResolvedValue({ ok: true, alreadyJoined: false, mosqueName: "جامع النور" });

    const res = await POST(postReq({ code: "abc" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyJoined: false, mosqueName: "جامع النور" });
    expect(mosqueDbMocks.joinHalaqahToMosqueByCode).toHaveBeenCalledWith(7, "abc");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("إعادة الانضمام: يمرّر alreadyJoined", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    mosqueDbMocks.joinHalaqahToMosqueByCode.mockResolvedValue({ ok: true, alreadyJoined: true, mosqueName: "جامع النور" });
    expect(await (await POST(postReq({ code: "abc" }))).json()).toMatchObject({ alreadyJoined: true });
  });

  it("حلقة بجامع آخر: 409 برسالة عربية", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    mosqueDbMocks.joinHalaqahToMosqueByCode.mockResolvedValue({ ok: false, reason: "conflict" });
    const res = await POST(postReq({ code: "abc" }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("جامع آخر");
  });

  it("رمز جامع غير صحيح أو ميزة الحلقات معطّلة: 404", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    mosqueDbMocks.joinHalaqahToMosqueByCode.mockResolvedValueOnce({ ok: false, reason: "invalid" });
    expect((await POST(postReq({ code: "bad" }))).status).toBe(404);
    mosqueDbMocks.joinHalaqahToMosqueByCode.mockResolvedValueOnce({ ok: false, reason: "disabled" });
    expect((await POST(postReq({ code: "abc" }))).status).toBe(404);
  });
});

describe("GET /api/teacher/join-mosque", () => {
  it("غير مسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await GET(getReq())).status).toBe(401);
  });

  it("المساعد: يرجع دوره فقط بلا استعلام عن الجامع", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    const res = await GET(getReq());
    expect(await res.json()).toEqual({ role: "assistant", halaqahName: "حلقة الفجر" });
    expect(mosqueDbMocks.findMosqueByTeacherJoinCode).not.toHaveBeenCalled();
  });

  it("المشرف: اسم الجامع ومدينته، ورمز مجهول = 404", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    mosqueDbMocks.findMosqueByTeacherJoinCode.mockResolvedValueOnce({ id: 5, name: "جامع النور", city: "جدة", createdAt: "" });
    expect(await (await GET(getReq())).json()).toMatchObject({ mosqueName: "جامع النور", city: "جدة", role: "supervisor" });
    expect(mosqueDbMocks.findMosqueByTeacherJoinCode).toHaveBeenCalledWith("abc");

    mosqueDbMocks.findMosqueByTeacherJoinCode.mockResolvedValueOnce(null);
    expect((await GET(getReq("nope"))).status).toBe(404);
  });
});
