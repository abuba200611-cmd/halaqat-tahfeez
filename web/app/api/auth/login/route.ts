import { findTeacherByUsername } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const teacher = await findTeacherByUsername(username);
  // رسالة واحدة للحالتين حتى لا تكشف أي أسماء المستخدمين موجودة
  if (!teacher || !verifyPassword(password, teacher.passwordHash)) {
    return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  await setSessionCookie(teacher.id);
  return Response.json({
    teacher: { id: teacher.id, username: teacher.username, halaqahName: teacher.halaqahName },
  });
}
