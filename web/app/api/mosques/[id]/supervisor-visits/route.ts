import { featureGate, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import { currentMosqueActor } from "@/lib/mosque/actor";
import { logServerError } from "@/lib/dev-error-log";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import {
  SUPERVISOR_VISITS_FEATURE_KEY,
  parseScheduleVisitBody,
} from "@/lib/supervisor-visits";
import {
  createVisit,
  getHalaqahInMosque,
  getVisitCriteria,
  listVisitsForMosque,
} from "@/lib/supervisor-visits-db";

/*
  B4 — زيارات المشرف التربوي لإدارة الجامع: قائمة زيارات الجامع (لكل
  الزائرين) مع معايير تقييمه، وجدولة زيارة جديدة لحلقة من حلقاته. النموذج
  وإجراءات الحالة في /[visitId]، وضبط المعايير في /settings.
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, SUPERVISOR_VISITS_FEATURE_KEY);
  if (gate) return gate;

  try {
    const [visits, criteria] = await Promise.all([listVisitsForMosque(mosqueId), getVisitCriteria(mosqueId)]);
    return Response.json({ visits, criteria });
  } catch (error) {
    await logServerError("mosque-supervisor-visits:get", error);
    throw error;
  }
}

/** جدولة زيارة: { halaqahId, scheduledFor } — الحلقة لازم تكون من حلقات هذا الجامع */
export async function POST(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, SUPERVISOR_VISITS_FEATURE_KEY);
  if (gate) return gate;

  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = parseScheduleVisitBody(body);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    const halaqah = await getHalaqahInMosque(mosqueId, parsed.halaqahId);
    if (!halaqah) return Response.json({ error: "الحلقة غير موجودة في هذا الجامع" }, { status: 404 });

    const actor = await currentMosqueActor();
    if (!(await checkRateLimit(`visit-write:${actor.kind}:${actor.id ?? mosqueId}`, 60, 3600))) {
      return rateLimited();
    }

    const visit = await createVisit({
      associationId: null,
      mosqueId,
      halaqahId: halaqah.id,
      visitorKind: "mosque_admin",
      visitorId: actor.id,
      visitorName: text(actor.label, 100),
      scheduledFor: parsed.scheduledFor,
    });
    return Response.json({ ok: true, visit });
  } catch (error) {
    await logServerError("mosque-supervisor-visits:post", error);
    throw error;
  }
}
