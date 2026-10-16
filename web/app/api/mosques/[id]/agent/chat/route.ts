import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { getAgentProvider } from "@/lib/agent/provider";
import { AgentRouteError, runAgent, sanitizeHistory } from "@/lib/agent/run";
import { logAgentUsage } from "@/lib/agent/store";
import { proposalDto } from "@/lib/agent/dto";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/*
  محادثة المساعد — غير متدفقة (يكفي رد واحد مجمع). الترتيب: بوابة
  الميزة، ثم جاهزية المزوّد (503 لا انهيار)، ثم حدّا المعدّل اليوميان
  (٦٠ للجامع و٣٠ للمستخدم — عدّادا rate_limits نفسها)، ثم التشغيل
  وتسجيل التوكنات (فشل التسجيل لا يُفشل الرد أبداً).
*/

const DAY_SECONDS = 86_400;
const MOSQUE_DAILY_LIMIT = 60;
const USER_DAILY_LIMIT = 30;

const UNAVAILABLE = { error: "المساعد غير مفعّل بعد" } as const;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "agent");
  if (gate) return gate;

  const provider = getAgentProvider();
  if (!provider) return Response.json(UNAVAILABLE, { status: 503 });

  // هوية الطالب للمعدّل وللمقترحات: مدير الجامع، أو المشرف العام (user_id فارغ)
  const mosqueAdmin = await currentMosqueAdmin();
  const userId = mosqueAdmin?.mosqueId === mosqueId ? mosqueAdmin.id : null;
  const userKey = userId !== null ? `admin:${userId}` : "super";

  const [mosqueAllowed, userAllowed] = await Promise.all([
    checkRateLimit(`agent:mosque:${mosqueId}`, MOSQUE_DAILY_LIMIT, DAY_SECONDS),
    checkRateLimit(`agent:user:${userKey}`, USER_DAILY_LIMIT, DAY_SECONDS),
  ]);
  if (!mosqueAllowed || !userAllowed) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { messages?: unknown };
  const history = sanitizeHistory(body.messages);
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return Response.json({ error: "اكتب رسالة للمساعد أولاً" }, { status: 400 });
  }

  try {
    const result = await runAgent({ provider, mosqueId, userId, history });
    try {
      await logAgentUsage(mosqueId, result.usage.inputTokens, result.usage.outputTokens);
    } catch (error) {
      console.error("agent usage logging failed", error);
    }
    return Response.json({ reply: result.reply, proposals: result.proposals.map(proposalDto) });
  } catch (error) {
    if (error instanceof AgentRouteError) {
      const status = error.message === "اكتب رسالة للمساعد أولاً" ? 400 : 503;
      return Response.json({ error: error.message }, { status });
    }
    throw error;
  }
}
