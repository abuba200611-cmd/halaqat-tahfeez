import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listPublishedResultsForStudent } from "@/lib/mosque/exams-db";

/**
 * نتائج اختبارات الطالب المنشورة فقط — halaqahId وstudentId من الجلسة
 * حصراً، والمسوّدات لا تظهر أبداً.
 */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();
  return Response.json({ results: await listPublishedResultsForStudent(student.teacherId, student.id) });
}
