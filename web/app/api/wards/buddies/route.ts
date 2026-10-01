import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listHalaqahMates } from "@/lib/db";

/** زملاء الحلقة الصالحون لاختيارهم بنموذج "سجّل وردي" (STEP 56) — الاسم فقط، بلا أي بيانات أخرى */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  return Response.json({ mates: await listHalaqahMates(student.teacherId, student.id) });
}
