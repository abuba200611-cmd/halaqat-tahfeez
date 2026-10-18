/*
  مهايئ مزوّد واتساب (B1). الرسائل المبدوءة من المنصة يجب أن تكون قوالب
  معتمدة لدى Meta حصراً، فالواجهة كلها قوالب ولا نص حرّ. المزوّد الرسمي
  هو WhatsApp Cloud API: WHATSAPP_TOKEN + WHATSAPP_PHONE_ID موجودان =
  مزوّد Meta؛ وإلا مزوّد صامت يسجّل ويرجع skipped:true — غياب المفاتيح
  لا ينهار ولا يغيّر سلوكاً (نفس مبدأ lib/mail.ts بالتكاملات الاختيارية).
*/

import { WHATSAPP_TEMPLATES, type WhatsappTemplateKey } from "./templates";

const GRAPH_VERSION = "v23.0";

export type WhatsappSendInput = {
  /** رقم E.164 كامل (9665XXXXXXXX) */
  to: string;
  template: WhatsappTemplateKey;
  /** قيم معاملات القالب بأسمائها من الواجهة (student_name …) */
  params?: Record<string, string>;
  /** تجاوز لغة القالب المسجَّلة (نادراً يلزم) */
  lang?: string;
};

export type WhatsappSendResult = {
  skipped: boolean;
  /** معرّف الرسالة لدى المزوّد عند النجاح */
  providerId?: string;
  /** نص الخطأ عند الفشل — لا استثناءات أبداً */
  error?: string;
};

export interface WhatsappProvider {
  readonly name: string;
  send(input: WhatsappSendInput): Promise<WhatsappSendResult>;
}

/** جسم طلب Cloud API لرسالة قالب — نقية خارج الاختبار فقط */
export function templateMessagePayload(input: WhatsappSendInput): Record<string, unknown> {
  const spec = WHATSAPP_TEMPLATES[input.template];
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: input.to,
    type: "template",
    template: {
      name: spec.name,
      language: { code: input.lang ?? spec.lang },
      components: [
        {
          type: "body",
          // Meta تستقبل معاملات المتن مرتبة موضعياً — كل مفتاح بترتيب params
          parameters: spec.params.map((key) => ({ type: "text", text: input.params?.[key] ?? "" })),
        },
      ],
    },
  };
}

/** مزوّد WhatsApp Cloud API الرسمي — لا يرمي أبداً، الفشل يرجع error */
export function metaWhatsappProvider(token: string, phoneId: string): WhatsappProvider {
  return {
    name: "meta",
    async send(input) {
      try {
        const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(templateMessagePayload(input)),
        });
        const data = (await res.json().catch(() => null)) as
          | { messages?: { id?: string }[]; error?: { message?: string } }
          | null;
        if (!res.ok) {
          return { skipped: false, error: data?.error?.message ?? `HTTP ${res.status}` };
        }
        return { skipped: false, providerId: data?.messages?.[0]?.id };
      } catch (error) {
        return { skipped: false, error: error instanceof Error ? error.message : "network error" };
      }
    },
  };
}

/** مزوّد صامت عندما لا مفاتيح — يسجّل ويرجع skipped:true بلا أي اتصال */
export function logWhatsappProvider(): WhatsappProvider {
  return {
    name: "log",
    async send(input) {
      console.log("[whatsapp:skipped] provider not configured", input.template, input.to);
      return { skipped: true };
    },
  };
}

/** المزوّد الفعلي من البيئة — يُقرأ عند كل إرسال فيسهل تبديله بالاختبار والتشغيل */
export function whatsappProvider(): WhatsappProvider {
  const token = (process.env.WHATSAPP_TOKEN ?? "").trim();
  const phoneId = (process.env.WHATSAPP_PHONE_ID ?? "").trim();
  return token && phoneId ? metaWhatsappProvider(token, phoneId) : logWhatsappProvider();
}
