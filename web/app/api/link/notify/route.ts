import { findLinkByUsername } from "@/lib/db";
import { requireLinkSecret } from "@/lib/link-auth";
import { sendPushToHalaqah } from "@/lib/push";

/**
 * نداء خادم لخادم من tasjeel-tullab: طالب مرتبط سجّل ورداً جديداً، فنبعث
 * إشعار فوري للمعلّم. محمي بنفس السرّ المشترك (x-link-secret) المستخدم
 * بجهة السحب — الاتجاه هنا معاكس فقط (tasjeel يستدعي حلقات).
 */
export async function POST(request: Request) {
  const denied = await requireLinkSecret(request, "link/notify");
  if (denied) return denied;

  const body = (await request.json().catch(() => ({}))) as { username?: unknown };
  const username = String(body.username ?? "").trim();
  if (!username) return Response.json({ error: "اسم المستخدم مطلوب" }, { status: 400 });

  const link = await findLinkByUsername(username);
  if (link) {
    await sendPushToHalaqah(link.teacherId, {
      title: "ورد جديد",
      body: `${link.studentName} سجّل ورداً جديداً — افتح صفحة الطلاب واسحب التحديث`,
      url: "/students",
    });
  }

  return Response.json({ ok: true });
}
