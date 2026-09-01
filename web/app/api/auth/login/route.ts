import { checkLoginRateLimit, findTeacherByUsername, recordFailedLoginAttempt } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

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

  const teacher = await findTeacherByUsername(username);
  // رسالة واحدة للحالتين حتى لا تكشف أي بريد إلكتروني مسجّل من عدمه
  if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
    await recordFailedLoginAttempt(ip);
    return Response.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  await setSessionCookie(teacher.id);
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
