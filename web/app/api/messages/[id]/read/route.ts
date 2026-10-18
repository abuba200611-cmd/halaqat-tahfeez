import { actorFeatureGate, markConversationRead, openConversationFor, resolveMessagingActor } from "@/lib/messaging";

/*
  B2 — تعليم المحادثة مقروءة الآن (يستدعيه العميل عند فتح المحادثة ووصول
  الجديد إليها). مشروط بعضوية الفاعل: غير الطرف = 404 كالعادة.
*/

const FEATURE_OFF = () => Response.json({ error: "المراسلة غير مفعّلة لهذا الجامع" }, { status: 404 });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9]+$/.test(id)) return Response.json({ error: "غير موجود" }, { status: 404 });
  const conversationId = Number(id);

  const url = new URL(request.url);
  const actor = await resolveMessagingActor(url.searchParams.get("role"));
  if (!actor) return Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  if ((await actorFeatureGate(actor)) === -1) return FEATURE_OFF();

  const conversation = await openConversationFor(actor, conversationId);
  if (!conversation) return Response.json({ error: "المحادثة غير موجودة" }, { status: 404 });

  const updated = await markConversationRead(actor, conversationId);
  if (!updated) return Response.json({ error: "المحادثة غير موجودة" }, { status: 404 });
  return Response.json({ ok: true });
}
