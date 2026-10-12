import { currentTeacher, unauthorized } from "@/lib/auth";
import { createParentLinkToken } from "@/lib/parent-db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/**
 * المعلّم يصدر رابط دعوة لولي أمر طالب في حلقته (STEP 61). halaqahId من جلسة
 * المعلّم حصراً، والـFK المركّب يرفض أي طالب خارج حلقته (→ 404).
 */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  if (!(await checkRateLimit(`parent-invite:teacher:${teacher.halaqahId}`, 60, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) return Response.json({ error: "معرّف الطالب مفقود" }, { status: 400 });

  const issued = await createParentLinkToken({ halaqahId: teacher.halaqahId, studentId, createdBy: "teacher" });
  if (!issued) return Response.json({ error: "الطالب غير موجود بحلقتك" }, { status: 404 });

  return Response.json({ token: issued.token, expiresAt: issued.expiresAt });
}
