import { findTeacherByUsername } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const teacher = await findTeacherByUsername(username);
  // رسالة واحدة للحالتين حتى لا تكشف أي بريد إلكتروني مسجّل من عدمه
  if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
    return Response.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  await setSessionCookie(teacher.id);
  return Response.json({
    teacher: {
      id: teacher.id,
      username: teacher.username,
      halaqahName: teacher.halaqahName,
      emailVerified: teacher.emailVerified,
    },
  });
}
