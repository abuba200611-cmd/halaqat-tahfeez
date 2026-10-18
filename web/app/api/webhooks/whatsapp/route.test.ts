import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  ويبهوك واتساب (B1): لا سرّ = 503، توقيع ناقص أو خاطئ = 401، والتوقيع
  الصحيح مع كلمة إيقاف («إيقاف»/STOP) يسقط موافقة صاحب الرقم المطبَّع.
  التوقيع HMAC-SHA256 على جسم الطلب الخام بالبايتات — نبنيه نحن بالاختبار.
*/

const parentDbMocks = vi.hoisted(() => ({ optOutParentByPhone: vi.fn() }));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const { GET, POST } = await import("./route");

const SECRET = "app-secret-value";

function signedRequest(payload: string, secret = SECRET): Request {
  const signature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
  return new Request("http://localhost/api/webhooks/whatsapp", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Hub-Signature-256": signature },
    body: payload,
  });
}

const inboundMessage = (from: string, text: string) =>
  JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, text: { body: text } }] } }] }] });

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});

describe("POST /api/webhooks/whatsapp — التوقيع", () => {
  it("بلا WHATSAPP_APP_SECRET: 503 (المسار غير مهيأ)", async () => {
    expect((await POST(signedRequest(inboundMessage("966501234567", "إيقاف")))).status).toBe(503);
  });

  it("بلا ترويسة توقيع: 401", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    const res = await new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body: inboundMessage("966501234567", "إيقاف"),
    });
    expect((await POST(res)).status).toBe(401);
  });

  it("توقيع بسِرّ خاطئ (تلاعب بالجسم بعد التوقيع): 401", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    const signedWithOtherSecret = signedRequest(inboundMessage("966501234567", "إيقاف"), "other-secret");
    expect((await POST(signedWithOtherSecret)).status).toBe(401);
  });
});

describe("POST — إيقاف الخدمة", () => {
  it("«إيقاف» من رقم موافق: تسقط موافقته بالرقم المطبَّع E.164", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    parentDbMocks.optOutParentByPhone.mockResolvedValue(1);

    const res = await POST(signedRequest(inboundMessage("0501234567", "إيقاف")));
    expect(res.status).toBe(200);
    expect(parentDbMocks.optOutParentByPhone).toHaveBeenCalledWith("966501234567");
    expect(((await res.json()) as { optedOut: number }).optedOut).toBe(1);
  });

  it("STOP اللاتينية تعمل أيضاً (بأحرف صغيرة أو كبيرة)", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    parentDbMocks.optOutParentByPhone.mockResolvedValue(0);

    expect((await POST(signedRequest(inboundMessage("966501234567", "STOP")))).status).toBe(200);
    expect((await POST(signedRequest(inboundMessage("966501234567", "stop")))).status).toBe(200);
    expect(parentDbMocks.optOutParentByPhone).toHaveBeenCalledTimes(2);
  });

  it("نص عادي أو رقم أجنبي: لا إيقاف والرد 200 دائماً", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    expect((await POST(signedRequest(inboundMessage("966501234567", "شكراً لكم")))).status).toBe(200);
    expect((await POST(signedRequest(inboundMessage("14155552671", "STOP")))).status).toBe(200);
    expect(parentDbMocks.optOutParentByPhone).not.toHaveBeenCalled();
  });

  it("جسم غير JSON بعد توقيع صحيح: 400", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    expect((await POST(signedRequest("not-json"))).status).toBe(400);
  });
});

describe("POST — حجم الجسم", () => {
  it("جسم فوق 256KB (بالنص): 413 قبل أي HMAC أو إيقاف", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    const res = await POST(signedRequest("x".repeat(256 * 1024 + 1)));
    expect(res.status).toBe(413);
    expect(parentDbMocks.optOutParentByPhone).not.toHaveBeenCalled();
  });

  it("Content-Length معلن فوق السقف: 413 دون قراءة الجسم", async () => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    const req = new Request("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      headers: { "content-length": String(300 * 1024) },
      body: "{}",
    });
    expect((await POST(req)).status).toBe(413);
  });
});

describe("GET — تحقق تسجيل الويبهوك", () => {
  const verifyUrl = (token: string) =>
    new Request(`http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(token)}&hub.challenge=cha123`);

  it("بلا WHATSAPP_VERIFY_TOKEN: 503", async () => {
    expect((await GET(verifyUrl("x"))).status).toBe(503);
  });

  it("الرمز الصحيح: يعيد challenge نصاً", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "my-verify-token";
    const res = await GET(verifyUrl("my-verify-token"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("cha123");
  });

  it("رمز خاطئ: 403", async () => {
    process.env.WHATSAPP_VERIFY_TOKEN = "my-verify-token";
    expect((await GET(verifyUrl("wrong"))).status).toBe(403);
  });
});
