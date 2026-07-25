import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listWardLogsForStudent } from "@/lib/db";

/** سجلّ أوراد الطالب نفسه — لعرضه في صفحته */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  return Response.json({ wards: listWardLogsForStudent(student.teacherId, student.id) });
}
