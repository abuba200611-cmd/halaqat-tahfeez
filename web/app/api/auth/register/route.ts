import { createTeacher, findTeacherByUsername } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");
  const halaqahName = String(body.halaqahName ?? "").trim();

  if (username.length < 3) {
    return Response.json({ error: "اسم المستخدم ٣ أحرف فأكثر" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "كلمة المرور ٨ أحرف فأكثر" }, { status: 400 });
  }
  if (findTeacherByUsername(username)) {
    return Response.json({ error: "اسم المستخدم مستخدم من قبل" }, { status: 409 });
  }

  const id = createTeacher(username, hashPassword(password), halaqahName);
  await setSessionCookie(id);

  return Response.json({ teacher: { id, username, halaqahName: halaqahName || "حلقتي" } });
}
