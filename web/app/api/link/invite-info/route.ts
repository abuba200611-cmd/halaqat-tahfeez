import { findTeacherByInviteCode } from "@/lib/db";

/**
 * معلومات عرض فقط عن حلقة رمز دعوة — يستخدمه تسجيل الطلاب ليعرض "ستنضم
 * لحلقة فلان" قبل التسجيل. محمي بنفس السرّ المشترك (نداء خادم لخادم فقط).
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

  return Response.json({ teacherName: teacher.teacherName, halaqahName: teacher.halaqahName });
}
