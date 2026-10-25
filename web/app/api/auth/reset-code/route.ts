import { clientIp } from "@/lib/client-ip";
import { setSessionCookie } from "@/lib/auth";
import { guardImpersonation } from "@/lib/dev-impersonation";
import { confirmResetCode } from "@/lib/reset-code";
import { realResetDeps } from "@/lib/reset-code-deps";
import { logSecurityEvent } from "@/lib/audit-log";

/** يتحقق من الرمز، يعيّن كلمة المرور، ويدخل المعلّم على هذا الجهاز */
export async function POST(request: Request) {
  // تغيير كلمة المرور هدّام — ممنوع أثناء «عرض كـ»
  const impBlocked = await guardImpersonation();
  if (impBlocked) return impBlocked;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ip = clientIp(request);
  const result = await confirmResetCode(
    { email: body.email, code: body.code, password: body.password, confirm: body.confirm },
    ip,
    realResetDeps,
  );
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  await logSecurityEvent({ event: "password.reset", actorKind: "teacher", actorId: result.teacherId, ip, details: { via: "code" } });

  // كلمة المرور رفعت نسخة الجلسة (تسقط الأجهزة الأخرى)؛ هذا الكوكي بالنسخة الجديدة
  await setSessionCookie(result.teacherId);
  return Response.json({ ok: true, redirect: "/" });
}
