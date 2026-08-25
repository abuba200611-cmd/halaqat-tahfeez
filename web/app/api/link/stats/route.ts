import { findTeacherByInviteCode, listStudents } from "@/lib/db";
import { pageCount } from "@/lib/pairing";

/**
 * إحصائيات حلقة معلّم لعرضها بلوحة نظام إدارة الجامع — نفس الحسابات
 * المعروضة بلوحة المعلّم نفسه (لوحة الحلقة). نداء خادم لخادم محمي
 * بالسرّ المشترك، يُقرأ برمز الدعوة (لا حاجة لمعرّف المعلّم الداخلي).
 */
export async function GET(request: Request) {
  const secret = request.headers.get("x-link-secret");
  if (!secret || secret !== process.env.LINK_SECRET) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "الرمز مفقود" }, { status: 400 });

  const teacher = await findTeacherByInviteCode(code);
  if (!teacher) return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });

  const students = await listStudents(teacher.id);
  const active = students.filter((s) => s.active);

  const totalPages = active.reduce((sum, s) => sum + pageCount(s), 0);
  const avgPages = active.length ? Math.round(totalPages / active.length) : 0;

  const masteryValues = active.flatMap((s) => Object.values(s.mastery));
  const avgMastery = masteryValues.length
    ? Math.round(masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length)
    : 0;

  return Response.json({
    activeStudents: active.length,
    totalPages,
    avgPages,
    avgMastery,
  });
}
