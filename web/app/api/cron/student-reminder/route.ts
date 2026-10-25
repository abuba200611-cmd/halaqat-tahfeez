import { riyadhTodayISO } from "@/lib/riyadh-date";
import { runStudentDailyReminder } from "@/lib/push";
import { safeEqual } from "@/lib/safe-equal";
import { deliverDueWebhooks } from "@/lib/webhooks-db";
import { runRetentionCleanup } from "@/lib/retention";
import { logSecurityEvent } from "@/lib/audit-log";

/**
 * تذكير الطلاب اليومي (STEP 54) — يستدعيه Vercel Cron وحده (راجع
 * vercel.json). بخلاف /api/push المفتوح لأي معلّم مسجَّل، هذا المسار
 * يعمل بلا جلسة مستخدم إطلاقاً فيحتاج سرّاً مستقلاً (CRON_SECRET) بدل
 * أي مصادقة جلسة — وبخلاف تذكير tasjeel-tullab المشابه (الذي يتجاوز
 * التحقق بصمت لو المتغيّر غير مضبوط)، غياب السرّ هنا خطأ تهيئة صريح
 * (500) لا تمريرة مفتوحة.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET غير مضبوط" }, { status: 500 });
  }

  const auth = request.headers.get("authorization");
  if (!auth || !safeEqual(auth, `Bearer ${secret}`)) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const result = await runStudentDailyReminder(riyadhTodayISO());

  // تسليم الويب هوكس المستحقة (التكاملات): الصندوق فارغ لأي جامع لم يفعّل الميزة،
  // وفشله لا يُفشل التذكير.
  let webhooks: unknown = null;
  try {
    webhooks = await deliverDueWebhooks();
  } catch (error) {
    console.error("webhook delivery failed", error);
  }

  // تنظيف الاحتفاظ التلقائي (نفس تنظيف لوحة المطوّر اليدوي): يحذف المنتهي فقط
  // فهو آمن التكرار، وفشله لا يُفشل بقية عمل الـcron.
  let retention: { total: number } | null = null;
  try {
    const results = await runRetentionCleanup();
    const total = results.reduce((sum, r) => sum + r.deleted, 0);
    const counts = Object.fromEntries(results.map((r) => [r.key, r.error ? "error" : r.deleted]));
    await logSecurityEvent({
      event: "retention.cleanup",
      actorKind: "developer",
      actorId: "cron",
      details: { source: "cron", total, ...counts },
    });
    retention = { total };
  } catch (error) {
    console.error("retention cleanup failed", error);
  }
  return Response.json({ ...result, ...(webhooks ? { webhooks } : {}), ...(retention ? { retention } : {}) });
}
