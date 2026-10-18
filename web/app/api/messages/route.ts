import {
  contactOptionsFor,
  listConversationsFor,
  resolveMessagingActor,
  actorFeatureGate,
  totalUnreadFor,
} from "@/lib/messaging";

/*
  B2 — صندوق الرسائل: قائمة محادثات الفاعل مع غير المقروء وجهات الاتصال،
  أو المجموع فقط (?summary=1 لوسم التنقّل). الفاعل من جلسة الدور المطلوب
  (معامل role) والصلاحية كلها خادمية بlib/messaging.
*/

const FEATURE_OFF = () => Response.json({ error: "المراسلة غير مفعّلة لهذا الجامع" }, { status: 404 });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const actor = await resolveMessagingActor(url.searchParams.get("role"));
  if (!actor) return Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  if ((await actorFeatureGate(actor)) === -1) return FEATURE_OFF();

  if (url.searchParams.get("summary") === "1") {
    return Response.json({ unreadTotal: await totalUnreadFor(actor) });
  }

  const [conversations, contacts] = await Promise.all([listConversationsFor(actor), contactOptionsFor(actor)]);
  return Response.json({
    role: actor.role,
    conversations,
    unreadTotal: conversations.reduce((sum, conversation) => sum + conversation.unread, 0),
    contacts,
  });
}
