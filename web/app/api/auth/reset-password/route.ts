import { consumePasswordReset, updateTeacherPassword } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { guardImpersonation } from "@/lib/dev-impersonation";

export async function POST(request: Request) {
  // تغيير كلمة المرور هدّام — ممنوع أثناء «عرض كـ» حتى لو تسلّل الرمز
  const impBlocked = await guardImpersonation();
  if (impBlocked) return impBlocked;

  const body = (await request.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  const token = String(body.token ?? "").trim();
  const password = String(body.password ?? "");

  if (!token) return Response.json({ error: "رمز الاسترجاع مفقود" }, { status: 400 });
  if (password.length < 8) {
    return Response.json({ error: "كلمة المرور ٨ أحرف فأكثر" }, { status: 400 });
  }

  const teacherId = await consumePasswordReset(token);
  if (!teacherId) {
    return Response.json({ error: "الرابط منتهي أو مستخدم من قبل — اطلب رابطاً جديداً" }, { status: 400 });
  }

  await updateTeacherPassword(teacherId, hashPassword(password));
  return Response.json({ ok: true });
}
