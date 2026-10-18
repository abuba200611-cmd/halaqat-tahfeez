import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  إعدادات واتساب لولي الأمر (B1): الجلسة شرط، الرقم يُطبَّع ويُرفض غير
  السعودي، والموافقة لا تُقبل بلا رقم (يُنفَّذها parent-db فنعايَرها).
*/

const parentAuthMocks = vi.hoisted(() => ({
  currentParent: vi.fn(),
  parentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/parent-auth", () => parentAuthMocks);

const parentDbMocks = vi.hoisted(() => ({
  getParentWhatsappInfo: vi.fn(),
  setParentWhatsappPhone: vi.fn(),
  disableParentWhatsappOptIn: vi.fn(),
  confirmParentWhatsappCode: vi.fn(),
}));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const optinMocks = vi.hoisted(() => ({ sendOptinCode: vi.fn() }));
vi.mock("@/lib/notify/optin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/notify/optin")>()),
  sendOptinCode: optinMocks.sendOptinCode,
}));

const rateLimitMocks = vi.hoisted(() => ({ checkRateLimit: vi.fn(async () => true), rateLimited: vi.fn() }));
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

const { GET, PUT } = await import("./route");
const { hashOptinCode } = await import("@/lib/notify/optin");

const parent = { id: 42, email: "w@example.com", name: "ولي", sessionVersion: 0 };
const info = { phone: "966501234567", optedIn: false, optedInAt: null, pendingConfirmation: true };

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/parent/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  parentAuthMocks.currentParent.mockResolvedValue(parent);
  parentDbMocks.getParentWhatsappInfo.mockResolvedValue(info);
  parentDbMocks.setParentWhatsappPhone.mockResolvedValue(true);
  parentDbMocks.disableParentWhatsappOptIn.mockResolvedValue(true);
  parentDbMocks.confirmParentWhatsappCode.mockResolvedValue("ok");
  optinMocks.sendOptinCode.mockResolvedValue("sent");
});

describe("GET /api/parent/whatsapp", () => {
  it("بلا جلسة ولي: 401", async () => {
    parentAuthMocks.currentParent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("بجلسة: يعيد الحالة الحالية", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(info);
  });
});

describe("PUT — الرقم", () => {
  it("رقم غير سعودي: 400 ولا حفظ", async () => {
    const res = await put({ phone: "0111234567" });
    expect(res.status).toBe(400);
    expect(parentDbMocks.setParentWhatsappPhone).not.toHaveBeenCalled();
  });

  it("رقم بصيغة 05…: يُحفظ مطبَّعاً E.164", async () => {
    const res = await put({ phone: "0501234567" });
    expect(res.status).toBe(200);
    expect(parentDbMocks.setParentWhatsappPhone).toHaveBeenCalledWith(
      parent.id,
      "966501234567",
      expect.stringMatching(/^[0-9a-f]{64}$/), // رمز مجزّأ لا خام
      3,
      10,
    );
  });

  it("الرمز المرسل للرقم هو نفسه المجزّأ المحفوظ، ويُرجع حالة الإرسال", async () => {
    const res = await put({ phone: "0501234567" });
    const [, , storedHash] = parentDbMocks.setParentWhatsappPhone.mock.calls[0] as [number, string, string];
    const [sentPhone, sentCode] = optinMocks.sendOptinCode.mock.calls[0] as [string, string];
    expect(sentPhone).toBe("966501234567");
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(hashOptinCode(parent.id, sentPhone, sentCode)).toBe(storedHash);
    expect((await res.json()).codeDelivery).toBe("sent");
  });

  it("المزوّد غير مهيأ: الرقم يُحفظ و codeDelivery=skipped (لا تأكيد ممكن)", async () => {
    optinMocks.sendOptinCode.mockResolvedValue("skipped");
    const res = await put({ phone: "0501234567" });
    expect(res.status).toBe(200);
    expect((await res.json()).codeDelivery).toBe("skipped");
  });

  it("تجاوز سقف تغيير الرقم اليومي: 429 ولا إرسال رمز", async () => {
    parentDbMocks.setParentWhatsappPhone.mockResolvedValue(false);
    const res = await put({ phone: "0501234567" });
    expect(res.status).toBe(429);
    expect(optinMocks.sendOptinCode).not.toHaveBeenCalled();
  });

  it("body بلا هاتف ولا optIn: 200 دون كتابة", async () => {
    const res = await put({});
    expect(res.status).toBe(200);
    expect(parentDbMocks.setParentWhatsappPhone).not.toHaveBeenCalled();
    expect(parentDbMocks.confirmParentWhatsappCode).not.toHaveBeenCalled();
  });
});

describe("PUT — الموافقة بعد تأكيد الرمز", () => {
  it("optIn:true مجرّداً (بلا رمز): 400 ولا تفعيل", async () => {
    const res = await put({ optIn: true });
    expect(res.status).toBe(400);
    expect(parentDbMocks.confirmParentWhatsappCode).not.toHaveBeenCalled();
  });

  it("رمز بصيغة غير 6 أرقام: 400 دون استعلام", async () => {
    expect((await put({ code: "12ab" })).status).toBe(400);
    expect(parentDbMocks.confirmParentWhatsappCode).not.toHaveBeenCalled();
  });

  it("رمز صحيح: يفعّل ويُرجع الحالة الجديدة", async () => {
    const optedIn = { ...info, optedIn: true, pendingConfirmation: false };
    parentDbMocks.getParentWhatsappInfo.mockResolvedValue(optedIn);
    const res = await put({ code: "123456" });
    expect(res.status).toBe(200);
    expect(parentDbMocks.confirmParentWhatsappCode.mock.calls[0]?.[1]).toBe("123456");
    expect(parentDbMocks.confirmParentWhatsappCode.mock.calls[0]?.[3]).toBe(5);
    expect(await res.json()).toEqual(optedIn);
  });

  it.each(["invalid", "expired", "locked", "none"])("نتيجة %s: 400", async (outcome) => {
    parentDbMocks.confirmParentWhatsappCode.mockResolvedValue(outcome);
    expect((await put({ code: "123456" })).status).toBe(400);
  });

  it("إيقاف الموافقة: يُستدعى disable", async () => {
    await put({ optIn: false });
    expect(parentDbMocks.disableParentWhatsappOptIn).toHaveBeenCalledWith(parent.id);
  });
});
