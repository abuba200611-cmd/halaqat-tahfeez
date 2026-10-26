import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listWardLogsForStudent } from "@/lib/db";
import { reviewTrackConfigForHalaqah } from "@/lib/mosque/review-tracks-db";
import { getHalaqahStage } from "@/lib/halaqah-stage-db";
import { profileFor } from "@/lib/halaqah-stage";

/**
 * سجلّ أوراد الطالب نفسه — لعرضه في صفحته، مع إعدادات تصنيف المراجعة
 * بحلقته وفئتها العمرية (001 T022: unit لواجهة العرض — البيانات كما هي).
 */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const stage = await getHalaqahStage(student.teacherId);
  return Response.json({
    wards: await listWardLogsForStudent(student.teacherId, student.id),
    reviewTrackConfig: await reviewTrackConfigForHalaqah(student.teacherId),
    stage,
    unit: profileFor(stage).unit,
  });
}
