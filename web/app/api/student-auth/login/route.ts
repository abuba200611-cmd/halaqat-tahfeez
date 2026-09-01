import { checkLoginRateLimit, findStudentByUsername, recordFailedLoginAttempt } from "@/lib/db";
import { setStudentSessionCookie, verifyPassword } from "@/lib/auth";

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
  // رسالة واحدة للحالتين حتى لا تكشف أي أسماء المستخدمين موجودة
  if (!student || !verifyPassword(password, student.passwordHash)) {
    await recordFailedLoginAttempt(ip);
    return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  await setStudentSessionCookie(student.teacherId, student.id);
  return Response.json({ student: { id: student.id, name: student.name } });
}
