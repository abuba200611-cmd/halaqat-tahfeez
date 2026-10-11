import { clearSessionCookie, currentTeacher, unauthorized } from "@/lib/auth";
import { bumpTeacherSessionVersion } from "@/lib/db";

/**
 * ينهي كل جلسات المعلّم على كل الأجهزة — رفع نسخة الجلسة يُبطل فوراً أي
 * رمز صادر سابقاً، بما فيه رمز الجلسة الحالية (نحذف كوكيزها أيضاً للوضوح).
 */
export async function POST() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  await bumpTeacherSessionVersion(teacher.id);
  await clearSessionCookie();
  return Response.json({ ok: true });
}
