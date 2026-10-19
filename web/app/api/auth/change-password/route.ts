import { currentTeacher, setSessionCookie, unauthorized } from "@/lib/auth";
import { teacherPasswordHash, updateTeacherPassword } from "@/lib/db";
import { handlePasswordChange, passwordInfoResponse } from "@/lib/password-change";

/** هل لحساب المعلّم كلمة مرور محلية؟ (حساب جوجل فقط = لا) */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  return passwordInfoResponse(await teacherPasswordHash(teacher.id));
}

/**
 * تغيير كلمة المرور من داخل الحساب. updateTeacherPassword يرفع نسخة الجلسة
 * (نفس آلية «إنهاء كل الجلسات»)، فنعيد إصدار كوكي هذا الجهاز بالنسخة الجديدة.
 */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return handlePasswordChange(request, {
    scope: "teacher",
    sessionId: teacher.id,
    loadHash: () => teacherPasswordHash(teacher.id),
    apply: async (hash) => {
      await updateTeacherPassword(teacher.id, hash);
      await setSessionCookie(teacher.id);
    },
  });
}
