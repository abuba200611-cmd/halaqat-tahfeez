import { createHmac } from "node:crypto";
import { normalizeSaudiPhone } from "@/lib/notify/phone";
import { optOutParentByPhone } from "@/lib/parent-db";
import { safeEqual } from "@/lib/safe-equal";

/*
  ويبهوك Meta لواتساب (B1). GET = تحقق التسجيل (hub.challenge)، وPOST =
  الأحداث: كل POST يجب أن يحمل X-Hub-Signature-256 (HMAC-SHA256 لجسم
  الطلب الخام بسرّ WHATSAPP_APP_SECRET). لا سرّ = 503 (المسار غير مهيأ
  بعد)، وتوقيع ناقص أو غير مطابق = 401 — جسم الطلب يُقرأ خاماً قبل أي
  تحليل لأن التوقيع على البايتات نفسها. المعالجة الحالية: كلمات إيقاف
  الخدمة («إيقاف»/«إلغاء»/STOP…) تسقط موافقة ولي الأمر صاحب الرقم.
  رسائل الحالة (sent/delivered/read) تُستقبل وتُتجاهل — الصادر يُحدَّث
  عند الإرسال أصلاً.
*/

/** سقف حجم الجسم قبل أي HMAC — أحداث Meta أصغر بكثير من هذا */
const MAX_BODY_BYTES = 256 * 1024;

const STOP_WORDS = new Set(["stop", "unsubscribe", "إيقاف", "ايقاف", "إلغاء", "الغاء", "توقف"]);

function expectedAppSecret(): string {
  return (process.env.WHATSAPP_APP_SECRET ?? "").trim();
}

function expectedVerifyToken(): string {
  return (process.env.WHATSAPP_VERIFY_TOKEN ?? "").trim();
}

/** تحقق تسجيل الويبهوك — يعيد hub.challenge نصاً كما تشترط Meta */
export async function GET(request: Request) {
  if (!expectedVerifyToken()) return Response.json({ error: "الويبهوك غير مهيأ" }, { status: 503 });

  const params = new URL(request.url).searchParams;
  const token = params.get("hub.verify_token") ?? "";
  if (params.get("hub.mode") !== "subscribe" || !safeEqual(token, expectedVerifyToken())) {
    return Response.json({ error: "تحقق مرفوض" }, { status: 403 });
  }
  return new Response(params.get("hub.challenge") ?? "", { status: 200 });
}

type WebhookBody = {
  entry?: {
    changes?: {
      value?: { messages?: { from?: string; text?: { body?: string } }[] };
    }[];
  }[];
};

export async function POST(request: Request) {
  const secret = expectedAppSecret();
  if (!secret) return Response.json({ error: "الويبهوك غير مهيأ" }, { status: 503 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return Response.json({ error: "الجسم كبير جداً" }, { status: 413 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "الجسم كبير جداً" }, { status: 413 });
  const signature = (request.headers.get("x-hub-signature-256") ?? "").toLowerCase();
  if (!signature.startsWith("sha256=")) return Response.json({ error: "توقيع مفقود" }, { status: 401 });
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (!safeEqual(signature, expected)) return Response.json({ error: "توقيع غير صحيح" }, { status: 401 });

  let body: WebhookBody;
  try {
    body = JSON.parse(raw) as WebhookBody;
  } catch {
    return Response.json({ error: "جسم غير صالح" }, { status: 400 });
  }

  let optedOut = 0;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const phone = normalizeSaudiPhone(message.from ?? "");
        const text = (message.text?.body ?? "").trim();
        // أي كلمة إيقاف معروفة تسقط الموافقة — رقم غير سعودي/جوال غير مسجّل
        // لا يفعل شيئاً (0 صفوف مُحدَّثة)
        if (phone !== null && text !== "" && STOP_WORDS.has(text.toLowerCase())) {
          try {
            optedOut += await optOutParentByPhone(phone);
          } catch {
            // فشل الإيقاف لا يردّ خطأ — Meta تعيد المحاولة، والرقم يبقى قائماً
          }
        }
      }
    }
  }

  // 200 دائماً بعد التوقيع الصحيح حتى لا تعيد Meta إرسال ما عالجناه
  return Response.json({ ok: true, optedOut });
}
