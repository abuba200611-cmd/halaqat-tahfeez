import { currentTeacher, unauthorized } from "@/lib/auth";
import { rotateHalaqahTeacherInviteCode } from "@/lib/db";

/**
 * يدوّر رمز دعوة المعلّم الزميل لحلقة المعلّم الحالي — يُبطل القديم فوراً
 * (STEP 6E — M2). halaqahId يُشتَق حصراً من الجلسة (currentTeacher())،
 * لا من أي مدخل عميل — لا يوجد ما يمكن للمعلّم إرساله ليدوّر حلقة غيره.
 */
export async function POST() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const inviteCode = await rotateHalaqahTeacherInviteCode(teacher.halaqahId);
  return Response.json({ inviteCode });
}
