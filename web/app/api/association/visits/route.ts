import { requireAssociationAdmin, associationNotFound } from "@/lib/association-gate";
import { getMosqueAssociationId } from "@/lib/association-db";
import { mosqueBelongsToAssociation } from "@/lib/association";
import { isFeatureEnabled } from "@/lib/mosque/db";
import { logServerError } from "@/lib/dev-error-log";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { SUPERVISOR_VISITS_FEATURE_KEY, parseScheduleVisitBody } from "@/lib/supervisor-visits";
import {
  createVisit,
  getHalaqahInMosque,
  listAssociationVisitTargets,
  listVisitsForAssociation,
} from "@/lib/supervisor-visits-db";

/*
  B4 — زيارات المشرف التربوي من لوحة الجمعية: زيارات مشرفيها على جوامع
  الجمعية كلها (GET)، وجدولة زيارة جديدة (POST). كل جامع/حلقة يتحقق انتماؤه
  للجمعية خادمياً من الجلسة — لا يُقبل معرّف جمعية من العميل — والجامع
  يجب أن تكون ميزته مفعّلة وإلا 404 لا يُكشف وجوده.
*/

export async function GET() {
  const auth = await requireAssociationAdmin();
  if ("response" in auth) return auth.response;

  try {
    const [visits, mosques] = await Promise.all([
      listVisitsForAssociation(auth.admin.associationId),
      listAssociationVisitTargets(auth.admin.associationId),
    ]);
    return Response.json({ visits, mosques });
  } catch (error) {
    await logServerError("association-visits:get", error);
    throw error;
  }
}

/** جدولة زيارة: { mosqueId, halaqahId, scheduledFor } — جامع من جمعية الجلسة وحلقة من حلقاته */
export async function POST(request: Request) {
  const auth = await requireAssociationAdmin();
  if ("response" in auth) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const parsed = parseScheduleVisitBody(body, { requireMosqueId: true });
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
    const mosqueId = parsed.mosqueId;

    // جامع جمعية أخرى أو بلا جمعية = 404 واحد لا يفرّق بين الحالات
    const mosqueAssociationId = await getMosqueAssociationId(mosqueId);
    if (!mosqueBelongsToAssociation(mosqueAssociationId, auth.admin.associationId)) return associationNotFound();
    if (!(await isFeatureEnabled(mosqueId, SUPERVISOR_VISITS_FEATURE_KEY))) return associationNotFound();

    const halaqah = await getHalaqahInMosque(mosqueId, parsed.halaqahId);
    if (!halaqah) return Response.json({ error: "الحلقة غير موجودة في هذا الجامع" }, { status: 404 });

    if (!(await checkRateLimit(`visit-write:association_admin:${auth.admin.id}`, 60, 3600))) {
      return rateLimited();
    }

    const visit = await createVisit({
      associationId: auth.admin.associationId,
      mosqueId,
      halaqahId: halaqah.id,
      visitorKind: "association_admin",
      visitorId: auth.admin.id,
      visitorName: auth.admin.username.slice(0, 100),
      scheduledFor: parsed.scheduledFor,
    });
    return Response.json({ ok: true, visit });
  } catch (error) {
    await logServerError("association-visits:post", error);
    throw error;
  }
}
