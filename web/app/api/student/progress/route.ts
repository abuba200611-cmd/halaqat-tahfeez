import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listAllWardLogsForStudent } from "@/lib/db";
import { computeJuzProgress } from "@/lib/juz-progress";
import { countReviewTrackPages } from "@/lib/review-tracks";
import { reviewTrackConfigForHalaqah } from "@/lib/mosque/review-tracks-db";
import { getHalaqahStage } from "@/lib/halaqah-stage-db";
import { profileFor } from "@/lib/halaqah-stage";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * B3 — تقدّم الحفظ بالأجزاء وعدّادات المراجعة لكل مسار للطالب نفسه، من
 * تاريخه الكامل (لا آخر ٣٠ ورداً). القراءة محصورة بجلسة الطالب نفسه:
 * المعرّفان من الجلسة حصراً، والطالب لا يرى إلا بياناته. الإعدادات
 * (تفعيل/صفحات/تسمية) من جامع حلقته تحدّد عرض العدّادات.
 */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const logs = await listAllWardLogsForStudent(student.teacherId, student.id);
  const today = riyadhTodayISO();
  const stage = await getHalaqahStage(student.teacherId);

  return Response.json({
    progress: computeJuzProgress(logs.map((l) => l.hifz)),
    trackCounts: {
      days7: countReviewTrackPages(logs, 7, today),
      days30: countReviewTrackPages(logs, 30, today),
    },
    reviewTrackConfig: await reviewTrackConfigForHalaqah(student.teacherId),
    // 001 T022: فئة الحلقة ووحدة العرض — التخزين لا يتغيّر
    stage,
    unit: profileFor(stage).unit,
  });
}
