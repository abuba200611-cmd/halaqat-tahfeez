import { requireAssociationAdmin } from "@/lib/association-gate";
import { getMosque, isFeatureEnabled } from "@/lib/mosque/db";
import { SUPERVISOR_VISITS_FEATURE_KEY } from "@/lib/supervisor-visits";
import { logServerError } from "@/lib/dev-error-log";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import {
  applyVisitAction,
  getVisitCriteria,
  getVisitForAssociation,
  getVisitScores,
} from "@/lib/supervisor-visits-db";

/*
  B4 — زيارة واحدة من لوحة الجمعية: التفاصيل بدرجاتها ومعايير جامعها
  (GET) وتعديلها (PUT) بنفس إجراءات مسار الجامع. الانتماء يتحقق خادمياً:
  زيارة جامع ليس من جمعية الجلسة = 404 لا يُكشف وجودها، مهما كان معرّفها.
*/

type RouteContext = { params: Promise<{ visitId: string }> };

function parseVisitId(value: string): number | null {
  if (!/^[0-9]+$/.test(value)) return null;
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

export async function GET(request: Request, { params }: RouteContext) {
  const auth = await requireAssociationAdmin();
  if ("response" in auth) return auth.response;
  const visitId = parseVisitId((await params).visitId);
  if (visitId === null) return Response.json({ error: "غير موجود" }, { status: 404 });

  try {
    const visit = await getVisitForAssociation(auth.admin.associationId, visitId);
    if (!visit) return Response.json({ error: "غير موجود" }, { status: 404 });
    // الميزة مغلقة لهذا الجامع = 404 (الافتراضي مغلق)
    if (!(await isFeatureEnabled(visit.mosqueId, SUPERVISOR_VISITS_FEATURE_KEY))) {
      return Response.json({ error: "غير موجود" }, { status: 404 });
    }
    const [criteria, scores, mosque] = await Promise.all([
      getVisitCriteria(visit.mosqueId),
      getVisitScores(visit.id),
      getMosque(visit.mosqueId),
    ]);
    return Response.json({ visit, criteria, scores, mosqueName: mosque?.name ?? "" });
  } catch (error) {
    await logServerError("association-visit:get", error);
    throw error;
  }
}

/** { action: save|done|cancel|reopen, scores?, notes?, recommendations? } */
export async function PUT(request: Request, { params }: RouteContext) {
  const auth = await requireAssociationAdmin();
  if ("response" in auth) return auth.response;
  const visitId = parseVisitId((await params).visitId);
  if (visitId === null) return Response.json({ error: "غير موجود" }, { status: 404 });

  try {
    const visit = await getVisitForAssociation(auth.admin.associationId, visitId);
    if (!visit) return Response.json({ error: "غير موجود" }, { status: 404 });
    // الميزة مغلقة لهذا الجامع = 404 (الافتراضي مغلق)
    if (!(await isFeatureEnabled(visit.mosqueId, SUPERVISOR_VISITS_FEATURE_KEY))) {
      return Response.json({ error: "غير موجود" }, { status: 404 });
    }

    if (!(await checkRateLimit(`visit-write:association_admin:${auth.admin.id}`, 60, 3600))) {
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
    await logServerError("association-visit:put", error);
    throw error;
  }
}
