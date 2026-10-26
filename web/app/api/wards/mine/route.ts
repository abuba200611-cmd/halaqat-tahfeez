import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listWardLogsForStudent } from "@/lib/db";
import { reviewTrackConfigForHalaqah } from "@/lib/mosque/review-tracks-db";

/** سجلّ أوراد الطالب نفسه — لعرضه في صفحته، مع إعدادات تصنيف المراجعة بحلقته */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  return Response.json({
    wards: await listWardLogsForStudent(student.teacherId, student.id),
    reviewTrackConfig: await reviewTrackConfigForHalaqah(student.teacherId),
  });
}
