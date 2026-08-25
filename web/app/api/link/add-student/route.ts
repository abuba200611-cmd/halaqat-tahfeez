import { addStudentByInviteCode } from "@/lib/db";

/**
 * نداء خادم لخادم من نظام إدارة الجامع: يضيف طالباً لقائمة معلّم عبر رمز
 * دعوة حلقته — بلا ربط بحساب تسجيل ورد (الطالب سجّل بالجامع فقط). محمي
 * بنفس السرّ المشترك (x-link-secret) المستخدم مع تسجيل-طلاب.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-link-secret");
  if (!secret || secret !== process.env.LINK_SECRET) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { inviteCode?: unknown; studentName?: unknown };
  const inviteCode = String(body.inviteCode ?? "").trim();
  const studentName = String(body.studentName ?? "").trim();
  if (!inviteCode || !studentName) {
    return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const result = await addStudentByInviteCode(inviteCode, studentName);
  if (!result) return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });

  return Response.json({ ok: true });
}
