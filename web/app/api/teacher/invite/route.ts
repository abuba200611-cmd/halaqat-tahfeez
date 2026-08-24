import { currentTeacher, unauthorized } from "@/lib/auth";
import { teacherInviteCode } from "@/lib/db";

/** عنوان نظام تسجيل الورد المستقل (tasjeel-tullab) — نفس المتغيّر المستخدم بجهة السحب اليدوي */
const LINK_API_URL = process.env.LINK_STUDENT_API_URL ?? "http://localhost:3100";

/** رابط دعوة جاهز للمشاركة — يفتح تسجيل حساب طالب جديد منضمّاً مباشرة لحلقة هذا المعلّم */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const code = await teacherInviteCode(teacher.id);
  return Response.json({ code, link: `${LINK_API_URL}/?invite=${code}` });
}
