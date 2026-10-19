import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { logServerError } from "@/lib/dev-error-log";
import { SUPERVISOR_VISITS_FEATURE_KEY, parseVisitCriteriaBody } from "@/lib/supervisor-visits";
import { getVisitCriteria, setVisitCriteria } from "@/lib/supervisor-visits-db";

/*
  B4 — معايير تقييم الزيارات لهذا الجامع: الافتراضيات بالكود، وهنا تُقرأ
  الإعدادات الحالية وتُحفظ تجاوزاتها (mosque_settings مفتاح "visit_criteria").
  تسري على زيارات الجامع كلها — مسجَّلة من إدارته أو من جمعيته.
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, SUPERVISOR_VISITS_FEATURE_KEY);
  if (gate) return gate;

  try {
    return Response.json({ criteria: await getVisitCriteria(mosqueId) });
  } catch (error) {
    await logServerError("mosque-visit-criteria:get", error);
    throw error;
  }
}

/** حفظ قائمة معايير مخصصة: { criteria: [{ key, label }] } */
export async function PUT(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, SUPERVISOR_VISITS_FEATURE_KEY);
  if (gate) return gate;

  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = parseVisitCriteriaBody(body);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    await setVisitCriteria(mosqueId, parsed.criteria);
    return Response.json({ ok: true, criteria: parsed.criteria });
  } catch (error) {
    await logServerError("mosque-visit-criteria:put", error);
    throw error;
  }
}
