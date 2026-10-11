import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { deleteStudentPushSubscription } from "@/lib/db";

/** إلغاء اشتراك جهاز الطالب — endpoint فقط من الجسم، والحذف مقفول على هوية الجلسة */
export async function DELETE(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  const endpoint = String(body.endpoint ?? "").trim();
  if (endpoint) await deleteStudentPushSubscription(student.teacherId, student.id, endpoint);
  return Response.json({ ok: true });
}
