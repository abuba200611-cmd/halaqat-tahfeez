import { after } from "next/server";
import { actorFeatureGate, resolveMessagingActor, sanitizeMessageBody, sendMessage } from "@/lib/messaging";
import { notifyMessageRecipients } from "@/lib/messaging-notify";

/*
  B2 — إرسال رسالة. العضوية والحدّ والميزة كلها داخل sendMessage: غير
  الطرف يرجع 404 (لا يكشف وجود المحادثة)، وتجاوز حدّ الإرسال 429، والإشعار
  الدفعي لبقية الأطراف بعد الرد داخل after() فلا يعطّله أو يعطّله شيء.
*/

const FEATURE_OFF = () => Response.json({ error: "المراسلة غير مفعّلة لهذا الجامع" }, { status: 404 });

export async function POST(request: Request) {
  const url = new URL(request.url);
  const actor = await resolveMessagingActor(url.searchParams.get("role"));
  if (!actor) return Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  if ((await actorFeatureGate(actor)) === -1) return FEATURE_OFF();

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const body = (input ?? {}) as { conversationId?: unknown; body?: unknown };
  const conversationId =
    typeof body.conversationId === "number" && Number.isSafeInteger(body.conversationId) && body.conversationId > 0
      ? body.conversationId
      : typeof body.conversationId === "string" && /^[0-9]+$/.test(body.conversationId)
        ? Number(body.conversationId)
        : null;
  if (!conversationId) return Response.json({ error: "محادثة غير صالحة" }, { status: 400 });

  const text = sanitizeMessageBody(body.body);
  if (!text) return Response.json({ error: "الرسالة فارغة أو تتجاوز ٢٠٠٠ محرف" }, { status: 400 });

  const result = await sendMessage(actor, conversationId, text);
  if (!result.ok) {
    if (result.reason === "rate-limited") return Response.json({ error: "أرسلت رسائل كثيرة، حاول بعد قليل" }, { status: 429 });
    return Response.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  }

  const payload = {
    sender: actor,
    recipients: result.recipients,
    halaqahId: result.conversation.halaqahId,
    body: text,
    conversationId: result.conversation.id,
  };
  after(async () => {
    try {
      await notifyMessageRecipients(payload);
    } catch {
      // لا شيء — الإشعار لا يعطّل الإرسال أبداً
    }
  });

  return Response.json({ message: result.message });
}
