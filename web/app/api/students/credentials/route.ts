import { currentTeacher, hashPassword, unauthorized } from "@/lib/auth";
import { setStudentCredentials, studentUsernames } from "@/lib/db";

/** خريطة معرّف الطالب ← اسم مستخدمه، لعرض من يملك حساباً في صفحة الطلاب */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return Response.json({ usernames: await studentUsernames(teacher.halaqahId) });
}

/**
 * المعلّم يمنح طالباً موجوداً اسمَ مستخدم وكلمة مرور، ليدخل الطالب لنظامه
 * ويسجّل ورده. كلمة المرور لا تمرّ عبر مخزن الطلاب المتفائل، بل هنا مباشرة.
 */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const studentId = String(body.studentId ?? "").trim();
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");

    if (!studentId) throw new Error("معرّف الطالب مفقود");
    if (username.length < 3) throw new Error("اسم المستخدم ٣ أحرف فأكثر");
    if (password.length < 6) throw new Error("كلمة المرور ٦ أحرف فأكثر");

    await setStudentCredentials(teacher.halaqahId, studentId, username, hashPassword(password));
    return Response.json({ ok: true, username });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر حفظ حساب الطالب" },
      { status: 400 },
    );
  }
}
