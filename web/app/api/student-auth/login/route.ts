import { findStudentByUsername } from "@/lib/db";
import { setStudentSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  const student = findStudentByUsername(username);
  // رسالة واحدة للحالتين حتى لا تكشف أي أسماء المستخدمين موجودة
  if (!student || !verifyPassword(password, student.passwordHash)) {
    return Response.json({ error: "اسم المستخدم أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  await setStudentSessionCookie(student.teacherId, student.id);
  return Response.json({ student: { id: student.id, name: student.name } });
}
