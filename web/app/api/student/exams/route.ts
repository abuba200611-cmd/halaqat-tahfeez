import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listPublishedResultsForStudent } from "@/lib/mosque/exams-db";
import { isFeatureEnabled } from "@/lib/mosque/db";
import { getMosqueIdForHalaqah } from "@/lib/fees-db";

/**
 * نتائج اختبارات الطالب المنشورة فقط — halaqahId وstudentId من الجلسة
 * حصراً، والمسوّدات لا تظهر أبداً.
 */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();
  const mosqueId = await getMosqueIdForHalaqah(student.teacherId);
  if (mosqueId === null || !(await isFeatureEnabled(mosqueId, "exams"))) {
    return Response.json({ error: "غير موجود" }, { status: 404 });
  }
  return Response.json({ results: await listPublishedResultsForStudent(student.teacherId, student.id) });
}
