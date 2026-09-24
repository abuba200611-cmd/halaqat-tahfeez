import { currentTeacher, unauthorized } from "@/lib/auth";
import { halaqahInviteCode } from "@/lib/db";

/**
 * رابط دعوة الطلاب — يفتح /student-join داخل هذا التطبيق نفسه (STEP 46)،
 * بنفس نطاق الطلب كرابط المعلّم المساعد. روابط tasjeel-tullab القديمة
 * (LINK_STUDENT_API_URL/?invite=) تظل تعمل هناك — الرمز نفسه مشترك.
 */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const code = await halaqahInviteCode(teacher.halaqahId);
  const origin = new URL(request.url).origin;
  return Response.json({ code, link: `${origin}/student-join?invite=${encodeURIComponent(code)}` });
}
