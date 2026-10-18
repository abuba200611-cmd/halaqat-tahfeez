import { actorFeatureGate, resolveMessagingActor, startConversation, type StartInput } from "@/lib/messaging";

/*
  B2 — بدء محادثة (أو إيجاد القائمة منها). لا تُقبل إلا عبر علاقة حقيقية
  موثَّقة بالقاعدة داخل startConversation: معلّم مع حلقته، طالب مع معلّمي
  حلقته، ولي أمر مع معلّمي أبنائه، ومدير الجامع مع معلّمي جامعه.
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

  const result = await startConversation(actor, (input && typeof input === "object" ? input : {}) as StartInput);
  if (result.ok) return Response.json({ conversationId: result.conversationId });
  if (result.reason === "invalid") return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  if (result.reason === "feature-off") return FEATURE_OFF();
  return Response.json({ error: "لا يمكنك بدء محادثة مع هذا الطرف" }, { status: 403 });
}
