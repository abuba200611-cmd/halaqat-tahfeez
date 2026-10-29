import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listWardLogsForStudent } from "@/lib/db";
import { studentWardsDaily } from "@/lib/dashboard-charts-db";
import { reviewTrackConfigForHalaqah } from "@/lib/mosque/review-tracks-db";
import { getHalaqahStage } from "@/lib/halaqah-stage-db";
import { profileFor } from "@/lib/halaqah-stage";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * سجلّ أوراد الطالب نفسه — لعرضه في صفحته، مع إعدادات تصنيف المراجعة
 * بحلقته وفئتها العمرية (001 T022: unit لواجهة العرض — البيانات كما هي).
 * wardsDaily: تجميع يومي آخر ٣٠ يوماً لرسم اللوحة (أرقام فقط).
 */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const [wards, wardsDaily, stage] = await Promise.all([
    listWardLogsForStudent(student.teacherId, student.id),
    studentWardsDaily(student.teacherId, student.id, riyadhTodayISO()),
    getHalaqahStage(student.teacherId),
  ]);
  return Response.json({
    wards,
    wardsDaily,
    reviewTrackConfig: await reviewTrackConfigForHalaqah(student.teacherId),
    stage,
    unit: profileFor(stage).unit,
  });
}
