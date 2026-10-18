import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logWhatsappProvider,
  metaWhatsappProvider,
  templateMessagePayload,
  whatsappProvider,
} from "./whatsapp";

/*
  اختيار المزوّد من البيئة، وبناء جسم طلب Cloud API (قوالب فقط)، وسلوك
  مزوّد Meta: نجاح/خطأ HTTP/خطأ شبكة — لا استثناءات أبداً.
*/

beforeEach(() => {
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("اختيار المزوّد من البيئة", () => {
  it("بلا مفاتيح: مزوّد صامت يرجع skipped:true ولا يتصل بشيء", async () => {
    const provider = whatsappProvider();
    expect(provider.name).toBe("log");
    const result = await provider.send({ to: "966501234567", template: "ward_approved" });
    expect(result).toEqual({ skipped: true });
  });

  it("بالمفاتيح: مزوّد Meta", () => {
    process.env.WHATSAPP_TOKEN = "EAAG...";
    process.env.WHATSAPP_PHONE_ID = "123456789";
    expect(whatsappProvider().name).toBe("meta");
  });

  it("السجل يُخفي الرقم ويُبقي آخر 3 أرقام فقط", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await logWhatsappProvider().send({ to: "966501234567", template: "exam_result" });
    const printed = spy.mock.calls.flat().join(" ");
    spy.mockRestore();
    expect(printed).toContain("***567");
    expect(printed).not.toContain("966501234567");
  });

  it("المزوّد الصامت نفسه يرجع skipped مباشرة", async () => {
    expect(await logWhatsappProvider().send({ to: "966501234567", template: "exam_result" })).toEqual({
      skipped: true,
    });
  });
});

describe("بناء الرسالة — قوالب فقط ولا نص حر", () => {
  it("المعاملات تُرسل بالترتيب الموضعي للقالب مع لغته", () => {
    const payload = templateMessagePayload({
      to: "966501234567",
      template: "exam_result",
      params: { student_name: "أحمد", exam_name: "جزء عم", result: "ناجح" },
    }) as { template: { name: string; language: { code: string }; components: { type: string; parameters: { type: string; text: string }[] }[] } };

    expect(payload.template.name).toBe("halaqa_exam_result");
    expect(payload.template.language.code).toBe("ar");
    expect(payload.template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "أحمد" },
          { type: "text", text: "جزء عم" },
          { type: "text", text: "ناجح" },
        ],
      },
    ]);
  });

  it("معامل ناقص يُرسل نصاً فارغاً لا يكسر الترتيب", () => {
    const payload = templateMessagePayload({ to: "966501234567", template: "ward_approved" }) as {
      template: { components: { parameters: { text: string }[] }[] };
    };
    expect(payload.template.components[0].parameters).toEqual([{ type: "text", text: "" }]);
  });
});

describe("مزوّد Meta", () => {
  it("النجاح: يقرأ معرّف الرسالة من الاستجابة", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.XYZ" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await metaWhatsappProvider("token", "phone1").send({
      to: "966501234567",
      template: "ward_approved",
      params: { student_name: "أحمد" },
    });

    expect(result).toEqual({ skipped: false, providerId: "wamid.XYZ" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://graph.facebook.com/v23.0/phone1/messages");
    expect(init.headers).toMatchObject({ Authorization: "Bearer token" });
    expect(JSON.parse(init.body as string).template.name).toBe("halaqa_ward_approved");
  });

  it("خطأ HTTP: يرجع error من رسالة Meta ولا يرمي", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "template not found" } }), { status: 400 }),
      ),
    );

    const result = await metaWhatsappProvider("token", "phone1").send({
      to: "966501234567",
      template: "ward_approved",
    });
    expect(result.skipped).toBe(false);
    expect(result.error).toBe("template not found");
  });

  it("فشل الشبكة: error نصي ولا يرمي أبداً", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const result = await metaWhatsappProvider("token", "phone1").send({
      to: "966501234567",
      template: "ward_approved",
    });
    expect(result.skipped).toBe(false);
    expect(result.error).toBe("ECONNRESET");
  });
});
