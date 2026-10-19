import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { currentMosqueActor } from "@/lib/mosque/actor";
import { getMosque } from "@/lib/mosque/db";
import { logServerError } from "@/lib/dev-error-log";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { SUPERVISOR_VISITS_FEATURE_KEY } from "@/lib/supervisor-visits";
import {
  applyVisitAction,
  getVisitCriteria,
  getVisitForMosque,
  getVisitScores,
} from "@/lib/supervisor-visits-db";

/*
  B4 — زيارة واحدة لإدارة الجامع: التفاصيل بدرجاتها ومعايير الجامع (GET)،
  وتعديلها (PUT): حفظ مسوّدة، إنهاء (يتطلب اكتمال كل المعايير ويحسب الدرجة
  الكلية خادمياً)، إلغاء، أو إعادة فتح. الزيارة تُقرأ مقيدة بجامع المسار —
  زيارة جامع آخر = 404 لا يُكشف وجودها.
*/

type RouteContext = { params: Promise<{ id: string; visitId: string }> };

async function loadVisit(mosqueId: number, visitId: number) {
  const visit = await getVisitForMosque(mosqueId, visitId);
  if (!visit) return null;
  const [criteria, scores, mosque] = await Promise.all([
    getVisitCriteria(mosqueId),
    getVisitScores(visit.id),
    getMosque(mosqueId),
  ]);
  return { visit, criteria, scores, mosqueName: mosque?.name ?? "" };
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id, visitId: visitParam } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const visitId = parsePositiveIntParam(visitParam);
  if (mosqueId === null || visitId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, SUPERVISOR_VISITS_FEATURE_KEY);
  if (gate) return gate;

  try {
    const data = await loadVisit(mosqueId, visitId);
    if (!data) return paramNotFound();
    return Response.json(data);
  } catch (error) {
    await logServerError("mosque-supervisor-visit:get", error);
    throw error;
  }
}

/** { action: save|done|cancel|reopen, scores?, notes?, recommendations? } */
export async function PUT(request: Request, { params }: RouteContext) {
  const { id, visitId: visitParam } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const visitId = parsePositiveIntParam(visitParam);
  if (mosqueId === null || visitId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, SUPERVISOR_VISITS_FEATURE_KEY);
  if (gate) return gate;

  try {
    const visit = await getVisitForMosque(mosqueId, visitId);
    if (!visit) return paramNotFound();

    const actor = await currentMosqueActor();
    if (!(await checkRateLimit(`visit-write:${actor.kind}:${actor.id ?? mosqueId}`, 60, 3600))) {
      return rateLimited();
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      scores?: unknown;
      notes?: unknown;
      recommendations?: unknown;
    };
    const result = await applyVisitAction({ visit, body });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, visit: result.visit, scores: result.scores });
  } catch (error) {
    await logServerError("mosque-supervisor-visit:put", error);
    throw error;
  }
}
