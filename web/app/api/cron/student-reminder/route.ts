import { riyadhTodayISO } from "@/lib/riyadh-date";
import { runStudentDailyReminder } from "@/lib/push";

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
  if (auth !== `Bearer ${secret}`) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const result = await runStudentDailyReminder(riyadhTodayISO());
  return Response.json(result);
}
