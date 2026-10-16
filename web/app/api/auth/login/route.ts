import { checkLoginRateLimit, findTeacherByUsername, recordFailedLoginAttempt } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { recordLogin } from "@/lib/activity";
import { peekRateLimit, rateLimited, recordRateLimitHit } from "@/lib/rate-limit";

/** أول عنوان بترويسة x-forwarded-for، أو "unknown" محلياً بلا بروكسي — نفس نمط /api/auth/register */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await checkLoginRateLimit(ip))) {
    return Response.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  // سقف إضافي لكل بريد على المحاولات الفاشلة فقط: نفحص قبل التحقّق
  // ونحتسب عند فشله حصراً — فلا يستطيع أحد قفل حساب المعلّم برشّ محاولات،
  // ويبقى كبح التخمين الموزّع فوق حدّ الـIP كما هو
  const emailLimitKey = `login:email:${username}`;
  if (!(await peekRateLimit(emailLimitKey, 10, 900))) {
    return rateLimited();
  }

  const teacher = await findTeacherByUsername(username);
  // رسالة واحدة للحالتين حتى لا تكشف أي بريد إلكتروني مسجّل من عدمه
  if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
    await recordRateLimitHit(emailLimitKey, 900);
    await recordFailedLoginAttempt(ip);
    return Response.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  // حساب موقوف من مشرف الحلقة: كلمة المرور صحيحة فلا تُحتسب المحاولة على
  // أي حدّ فاشل — يُخبَر بسبب المنع صراحة بدل رسالة "غير صحيحة" المضلّلة
  if (teacher.deactivatedAt) {
    return Response.json({ error: "تم إيقاف حسابك من مشرف الحلقة" }, { status: 403 });
  }

  await setSessionCookie(teacher.id);
  await recordLogin({ role: "teacher", teacherId: teacher.id });
  return Response.json({
    teacher: {
      id: teacher.id,
      username: teacher.username,
      teacherName: teacher.teacherName,
      halaqahId: teacher.halaqahId,
      halaqahName: teacher.halaqahName,
      role: teacher.role,
      emailVerified: teacher.emailVerified,
    },
  });
}
