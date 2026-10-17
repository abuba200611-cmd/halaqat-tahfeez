import { requireAssociationMosque } from "@/lib/association-gate";
import { listMosqueHalaqahRows } from "@/lib/association-db";
import { parseAssociationPeriod } from "@/lib/association";
import { getMosque, getMosqueFeatures } from "@/lib/mosque/db";
import { effectiveFeatures } from "@/lib/mosque/features";
import { examStatsBetween } from "@/lib/mosque/exams-db";
import { hijriMonthRange } from "@/lib/mosque/report-periods";
import { buildPermitsOverview } from "@/lib/permits-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { logServerError } from "@/lib/dev-error-log";

/*
  A3 — عرض جامع من لوحة الجمعية، قراءة فقط. جامع ليس من جمعية الجلسة = 404
  (لا يُفرَّق بينه وبين غير الموجود). الأقسام تُعرض فقط إن كانت ميزتها مفعّلة
  لذلك الجامع؛ ولا يمرّ شيء من هنا عبر مسارات تعديل الجامع (هي لا تقبل جلسة
  الجمعية أصلاً — canAccessMosque لا يعرف كوكيها).
*/

type RouteContext = { params: Promise<{ mosqueId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const gate = await requireAssociationMosque((await params).mosqueId);
  if ("response" in gate) return gate.response;
  const { mosqueId } = gate;

  const period = parseAssociationPeriod(new URL(request.url).searchParams, hijriMonthRange(new Date()));
  if (!period.ok) return Response.json({ error: period.error }, { status: 400 });

  try {
    const [mosque, featureRows, halaqat] = await Promise.all([
      getMosque(mosqueId),
      getMosqueFeatures(mosqueId),
      listMosqueHalaqahRows(mosqueId, period),
    ]);
    if (!mosque) return Response.json({ error: "غير موجود" }, { status: 404 });
    const features = effectiveFeatures(featureRows);

    const [exams, permits] = await Promise.all([
      features.exams ? examStatsBetween(mosqueId, period.from, period.to) : Promise.resolve(null),
      features.permits ? buildPermitsOverview(mosqueId, riyadhTodayISO()) : Promise.resolve(null),
    ]);

    return Response.json({
      mosque: { id: mosque.id, name: mosque.name, city: mosque.city },
      period: { from: period.from, to: period.to },
      features: { exams: !!features.exams, permits: !!features.permits },
      halaqat,
      exams,
      // للقراءة فقط: بلا سجل التدقيق ولا بطاقات الإجراءات
      permits: permits
        ? {
            academicYear: permits.academicYear,
            halaqat: permits.halaqat.map((h) => ({
              halaqahId: h.halaqahId,
              name: h.name,
              activeStudents: h.activeStudents,
              status: h.permit?.status ?? null,
              renewalDue: h.permit?.renewalDue ?? null,
              suspensionsCount: h.permit?.suspensionsCount ?? 0,
            })),
          }
        : null,
    });
  } catch (error) {
    await logServerError("association-mosque:get", error);
    throw error;
  }
}
