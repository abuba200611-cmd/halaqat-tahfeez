import { checkLoginRateLimit, findStudentByUsername, recordFailedLoginAttempt } from "@/lib/db";
import { setStudentSessionCookie, verifyPassword } from "@/lib/auth";
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
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const student = await findStudentByUsername(username);
  // سقف إضافي لكل (اسم مستخدم + حلقة) على المحاولات الفاشلة فقط —
  // نفس نمط حدّ البريد بدخول المعلّم: فحص قبل التحقّق واحتساب عند فشله
  // حصراً، حتى لا يُقفل حساب الطالب برشّ محاولات من أحد
  const usernameLimitKey = student ? `student-login:${student.teacherId}:${username}` : null;
  if (usernameLimitKey && !(await peekRateLimit(usernameLimitKey, 10, 900))) {
    return rateLimited();
  }
  // رسالة واحدة للحالتين حتى لا تكشف أي أسماء المستخدمين موجودة
  if (!student || !verifyPassword(password, student.passwordHash)) {
    if (usernameLimitKey) await recordRateLimitHit(usernameLimitKey, 900);
    await recordFailedLoginAttempt(ip);
    return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  await setStudentSessionCookie(student.teacherId, student.id);
  await recordLogin({ role: "student", halaqahId: student.teacherId, studentId: student.id });
  return Response.json({ student: { id: student.id, name: student.name } });
}
