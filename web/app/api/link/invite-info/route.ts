import { findHalaqahByInviteCode } from "@/lib/db";
import { requireLinkSecret } from "@/lib/link-auth";

/**
 * معلومات عرض فقط عن حلقة رمز دعوة — يستخدمه تسجيل الطلاب ليعرض "ستنضم
 * لحلقة فلان" قبل التسجيل. محمي بنفس السرّ المشترك (نداء خادم لخادم فقط).
 */
export async function GET(request: Request) {
  const denied = await requireLinkSecret(request, "link/invite-info");
  if (denied) return denied;

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "الرمز مفقود" }, { status: 400 });

  const halaqah = await findHalaqahByInviteCode(code);
  if (!halaqah) return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });

  return Response.json({ teacherName: halaqah.teacherName, halaqahName: halaqah.halaqahName });
}
