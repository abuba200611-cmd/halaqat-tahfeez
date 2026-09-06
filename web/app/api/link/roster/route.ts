import { findHalaqahByInviteCode, listStudents } from "@/lib/db";
import { requireLinkSecret } from "@/lib/link-auth";
import { pageCount } from "@/lib/pairing";

/**
 * قائمة طلاب حلقة معلّم بالاسم — لعرضها بلوحة نظام إدارة الجامع (تفاصيل
 * الحلقة). نداء خادم لخادم محمي بالسرّ المشترك، يُقرأ برمز الدعوة.
 */
export async function GET(request: Request) {
  const denied = await requireLinkSecret(request, "link/roster");
  if (denied) return denied;

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "الرمز مفقود" }, { status: 400 });

  const halaqah = await findHalaqahByInviteCode(code);
  if (!halaqah) return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });

  const students = await listStudents(halaqah.id);
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
    teacherName: halaqah.teacherName,
    halaqahName: halaqah.halaqahName,
    students: roster,
  });
}
