import { actorFeatureGate, listMessages, openConversationFor, resolveMessagingActor } from "@/lib/messaging";

/*
  B2 — رسائل محادثة واحدة بصفحنة بالمؤشر (?before=معرّف أقدم رسالة).
  الوصول بعضوية الفاعل فقط: غير الطرف = 404 مهما كانت المحادثة.
*/

const FEATURE_OFF = () => Response.json({ error: "المراسلة غير مفعّلة لهذا الجامع" }, { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) return Response.json({ error: "غير موجود" }, { status: 404 });
  const conversationId = Number(id);

  const url = new URL(request.url);
  const actor = await resolveMessagingActor(url.searchParams.get("role"));
  if (!actor) return Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  if ((await actorFeatureGate(actor)) === -1) return FEATURE_OFF();

  const conversation = await openConversationFor(actor, conversationId);
  if (!conversation) return Response.json({ error: "المحادثة غير موجودة" }, { status: 404 });

  const beforeRaw = url.searchParams.get("before");
  const before = beforeRaw && /^[0-9]+$/.test(beforeRaw) ? Number(beforeRaw) : null;
  const page = await listMessages(actor, conversationId, before);

  return Response.json({
    conversation: { id: conversation.id, kind: conversation.kind, title: conversation.title },
    messages: page.messages,
    nextBefore: page.nextBefore,
  });
}
