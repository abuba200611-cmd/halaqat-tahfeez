import { findTeacherByInviteCode, listStudents } from "@/lib/db";
import { pageCount } from "@/lib/pairing";

/**
 * قائمة طلاب حلقة معلّم بالاسم — لعرضها بلوحة نظام إدارة الجامع (تفاصيل
 * الحلقة). نداء خادم لخادم محمي بالسرّ المشترك، يُقرأ برمز الدعوة.
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
  const roster = students.map((s) => {
    const masteryValues = Object.values(s.mastery);
    const avgMastery = masteryValues.length
      ? Math.round(masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length)
      : 0;
    return {
      name: s.name,
      group: s.group,
      pages: pageCount(s),
      avgMastery,
      active: s.active,
    };
  });

  return Response.json({
    teacherName: teacher.teacherName,
    halaqahName: teacher.halaqahName,
    students: roster,
  });
}
