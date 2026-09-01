import { currentTeacher, unauthorized } from "@/lib/auth";
import { createStudentGoogleLinkToken } from "@/lib/db";

/**
 * المعلّم يصدر رمز ربط لمرة واحدة لطالب موجود مسبقاً داخل حلقته، ليسلّمه
 * له يدوياً ليربط حساب Google بسجله الأكاديمي (STEP 6B). halaqahId يأتي
 * من جلسة المعلّم حصراً — لا نثق بأي halaqahId من العميل. لا حاجة لتحقّق
 * منفصل من ملكية الطالب: الـFK المركّب على student_google_link_tokens
 * يرفض أي studentId لا ينتمي فعلاً لحلقة هذا المعلّم.
 */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) return Response.json({ error: "معرّف الطالب مفقود" }, { status: 400 });

  const issued = await createStudentGoogleLinkToken({
    halaqahId: teacher.halaqahId,
    studentId,
    createdByType: "teacher",
    createdById: teacher.id,
  });
  if (!issued) return Response.json({ error: "الطالب غير موجود بحلقتك" }, { status: 404 });

  return Response.json({ token: issued.token, expiresAt: issued.expiresAt });
}
