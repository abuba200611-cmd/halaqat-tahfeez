import { consumePasswordReset, updateTeacherPassword } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { guardImpersonation } from "@/lib/dev-impersonation";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { logSecurityEvent } from "@/lib/audit-log";

export async function POST(request: Request) {
  // تغيير كلمة المرور هدّام — ممنوع أثناء «عرض كـ» حتى لو تسلّل الرمز
  const impBlocked = await guardImpersonation();
  if (impBlocked) return impBlocked;

  // روابط الاسترجاع القديمة: الرمز عالي العشوائية، والحدّ يكبح الرشّ والإغراق
  const ip = clientIp(request);
  if (!(await checkRateLimit(`reset-link-ip:${ip}`, 20, 15 * 60))) return rateLimited();

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
  await logSecurityEvent({ event: "password.reset", actorKind: "teacher", actorId: teacherId, ip, details: { via: "link" } });
  return Response.json({ ok: true });
}
