import { featureGate, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import { currentMosqueActor } from "@/lib/mosque/actor";
import { buildPermitsOverview, recordUpgradeRequest } from "@/lib/permits-db";
import { PERMITS_FEATURE_KEY, PERMIT_NOTES_MAX } from "@/lib/permits";
import { logServerError } from "@/lib/dev-error-log";

/*
  A3 — تصاريح الحلقات لإدارة الجامع: حالة تصاريح الحلقات للعام الدراسي الحالي،
  بطاقات الاقتراحات القابلة للتنفيذ، وسجل التدقيق. الاقتراحات لا تُنفَّذ تلقائياً
  أبداً — كل تغيير يدوي عبر /permits/[halaqahId].
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, PERMITS_FEATURE_KEY);
  if (gate) return gate;

  try {
    return Response.json(await buildPermitsOverview(mosqueId));
  } catch (error) {
    await logServerError("mosque-permits:get", error);
    throw error;
  }
}

/** تسجيل طلب ترقية الحلقات إلى «مجمع» على مستوى الجامع: { action: "upgrade_request", notes? } */
export async function POST(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, PERMITS_FEATURE_KEY);
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; notes?: unknown };
  if (body.action !== "upgrade_request") return Response.json({ error: "إجراء غير معروف" }, { status: 400 });

  try {
    const actor = await currentMosqueActor();
    await recordUpgradeRequest(mosqueId, actor, text(body.notes, PERMIT_NOTES_MAX));
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("mosque-permits:upgrade", error);
    throw error;
  }
}
