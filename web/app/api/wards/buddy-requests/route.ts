import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listPendingBuddyRequestsForStudent, respondToBuddyRequest } from "@/lib/db";

/** طلبات تأكيد "راجعت معك" بانتظار ردّ الطالب الحالي (STEP 56) — لبطاقة الرئيسية */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  return Response.json({ requests: await listPendingBuddyRequestsForStudent(student.teacherId, student.id) });
}

/**
 * الطالب الحالي يؤكّد أو يرفض طلباً موجَّهاً إليه تحديداً. respondToBuddyRequest
 * تقفل على (buddy_student_id = جلسة الطالب) و(status='pending') داخل
 * جملة SQL نفسها — أي طالب ثالث أو طلب أُجيب عليه مسبقاً يرجع 404، لا
 * يكشف الفرق بين "ليس لك" و"غير موجود أصلاً".
 */
export async function PATCH(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const body = (await request.json().catch(() => ({}))) as { wardLogId?: unknown; action?: unknown };
  const wardLogId = Number(body.wardLogId);
  if (!Number.isInteger(wardLogId)) return Response.json({ error: "معرّف الورد مفقود" }, { status: 400 });
  if (body.action !== "confirm" && body.action !== "decline") {
    return Response.json({ error: "إجراء غير صحيح" }, { status: 400 });
  }

  const ok = await respondToBuddyRequest(student.teacherId, student.id, wardLogId, body.action === "confirm");
  if (!ok) return Response.json({ error: "الطلب غير موجود أو انتهى" }, { status: 404 });

  return Response.json({ ok: true });
}
