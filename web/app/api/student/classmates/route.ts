import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { halaqahClassmatesVisible, listClassmateNames } from "@/lib/db";

/**
 * زملاء حلقة الطالب (أسماء فقط). الحلقة من جلسة الطالب حصراً — لا معامل
 * عميل، فلا IDOR. إن عطّل المعلّم الميزة: 403 بلا أي أسماء.
 */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  if (!(await halaqahClassmatesVisible(student.teacherId))) {
    return Response.json({ error: "عرض زملاء الحلقة غير مفعّل" }, { status: 403 });
  }

  const names = await listClassmateNames(student.teacherId);
  return Response.json({ classmates: names.map((name) => ({ name })) });
}
