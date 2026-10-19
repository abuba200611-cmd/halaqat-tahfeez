import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { halaqahClassmatesVisible } from "@/lib/db";

/** هل ميزة زملاء الحلقة مفعّلة لحلقة الطالب؟ — لإظهار عنصر القائمة فقط */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();
  return Response.json({ enabled: await halaqahClassmatesVisible(student.teacherId) });
}
