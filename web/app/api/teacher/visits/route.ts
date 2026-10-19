import { currentTeacher, unauthorized } from "@/lib/auth";
import { getHalaqah, isFeatureEnabled } from "@/lib/mosque/db";
import { logServerError } from "@/lib/dev-error-log";
import { SUPERVISOR_VISITS_FEATURE_KEY } from "@/lib/supervisor-visits";
import { getVisitCriteria, getVisitScores, listDoneVisitsForHalaqah } from "@/lib/supervisor-visits-db";

/*
  B4 — زيارات المشرف التربوي بعين معلّم الحلقة: قراءة فقط للزيارات المنجزة
  لحلقته (الملاحظات والتوصيات ودرجات المعايير). الحلقة من جلسة المعلّم حصراً
  — لا يُقبل معرّف حلقة من العميل — والميزة لازم تكون مفعّلة لجامعها، وإلا
  قائمة فارغة مع enabled:false (لا يُكشف شيء لأغراض أخرى).
*/

export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  try {
    const halaqah = await getHalaqah(teacher.halaqahId);
    if (!halaqah || halaqah.mosqueId === null || !(await isFeatureEnabled(halaqah.mosqueId, SUPERVISOR_VISITS_FEATURE_KEY))) {
      return Response.json({ enabled: false, halaqahName: halaqah?.halaqahName ?? teacher.halaqahName, visits: [] });
    }

    const [rows, criteria] = await Promise.all([
      listDoneVisitsForHalaqah(teacher.halaqahId),
      getVisitCriteria(halaqah.mosqueId),
    ]);
    const visits = await Promise.all(
      rows.map(async (visit) => ({ ...visit, scores: await getVisitScores(visit.id) })),
    );
    return Response.json({ enabled: true, halaqahName: halaqah.halaqahName, criteria, visits });
  } catch (error) {
    await logServerError("teacher-visits:get", error);
    throw error;
  }
}
