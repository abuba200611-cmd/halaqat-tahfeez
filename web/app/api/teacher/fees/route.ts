import { currentTeacher, unauthorized } from "@/lib/auth";
import { getHalaqah, isFeatureEnabled } from "@/lib/mosque/db";
import { FEES_FEATURE_KEY } from "@/lib/fees";
import { latestFeeStatusByStudent } from "@/lib/fees-db";
import { logServerError } from "@/lib/dev-error-log";

/*
  حالة رسوم آخر فترة لكل طالب بحلقة المعلّم — الحالة فقط (بلا مبالغ ولا دفعات)،
  قراءة فقط. الحلقة من جلسة المعلّم حصراً (لا معرّف من العميل)، والميزة لازم
  تكون مفعّلة لجامعها وإلا { enabled:false } بلا بيانات.
*/
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  try {
    const halaqah = await getHalaqah(teacher.halaqahId);
    if (!halaqah || halaqah.mosqueId === null || !(await isFeatureEnabled(halaqah.mosqueId, FEES_FEATURE_KEY))) {
      return Response.json({ enabled: false, statuses: {} });
    }
    return Response.json({ enabled: true, statuses: await latestFeeStatusByStudent(teacher.halaqahId) });
  } catch (error) {
    await logServerError("teacher-fees:get", error);
    throw error;
  }
}
