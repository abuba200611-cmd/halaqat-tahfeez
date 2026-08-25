import { currentTeacher, unauthorized } from "@/lib/auth";
import { halaqahTeacherInviteCode, listHalaqahTeachers } from "@/lib/db";

/** رابط دعوة معلّم زميل (مساعد مشرف) لنفس الحلقة، وقائمة فريقها الحالي */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const [code, team] = await Promise.all([
    halaqahTeacherInviteCode(teacher.halaqahId),
    listHalaqahTeachers(teacher.halaqahId),
  ]);
  const origin = new URL(request.url).origin;
  return Response.json({ code, link: `${origin}/?join=${code}`, team });
}
