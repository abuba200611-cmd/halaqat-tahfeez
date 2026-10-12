import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { createParentLinkToken } from "@/lib/parent-db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/**
 * الطالب يصدر رابط دعوة لولي أمره (STEP 61). الحلقة والطالب من جلسته حصراً —
 * أي قيمة بجسم الطلب تُتجاهَل تماماً.
 */
export async function POST() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  if (!(await checkRateLimit(`parent-invite:student:${student.teacherId}:${student.id}`, 10, 3600))) {
    return rateLimited();
  }

  const issued = await createParentLinkToken({
    halaqahId: student.teacherId,
    studentId: student.id,
    createdBy: "student",
  });
  if (!issued) return Response.json({ error: "تعذّر إنشاء الرابط" }, { status: 404 });

  return Response.json({ token: issued.token, expiresAt: issued.expiresAt });
}
