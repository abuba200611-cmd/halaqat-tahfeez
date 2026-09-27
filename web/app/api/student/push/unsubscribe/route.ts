import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { deleteStudentPushSubscription } from "@/lib/db";

/** إلغاء اشتراك جهاز الطالب — endpoint فقط من الجسم، لا student_id (الحذف بمعرّف الجهاز نفسه يكفي ويطابق نمط /api/push الحالي) */
export async function DELETE(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  const endpoint = String(body.endpoint ?? "").trim();
  if (endpoint) await deleteStudentPushSubscription(endpoint);
  return Response.json({ ok: true });
}
