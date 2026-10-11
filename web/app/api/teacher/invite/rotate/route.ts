import { currentTeacher, unauthorized } from "@/lib/auth";
import { rotateHalaqahInviteCode } from "@/lib/db";

/**
 * يدوّر رمز دعوة الطلاب — مشرف الحلقة (المالك) فقط؛ الرمز القديم يبطل
 * فوراً لأن العمود نفسه مصدر الحقيقة الوحيد. halaqahId من الجلسة حصراً.
 */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.role !== "supervisor") {
    return Response.json({ error: "تجديد رابط الدعوة متاح لمشرف الحلقة فقط" }, { status: 403 });
  }

  const code = await rotateHalaqahInviteCode(teacher.halaqahId);
  const origin = new URL(request.url).origin;
  return Response.json({ code, link: `${origin}/student-join?invite=${encodeURIComponent(code)}` });
}
