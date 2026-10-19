import { currentTeacher, unauthorized } from "@/lib/auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { checkinSecret, qrAttendanceEnabledForHalaqah } from "@/lib/qr-checkin-db";
import { CHECKIN_WINDOW_MS, checkinPath, createCheckinToken, windowEndsAt } from "@/lib/qr-checkin";
import { logServerError } from "@/lib/dev-error-log";

/*
  رمز الحضور الحالي للحلقة (يعرضه المعلّم على شاشته). الحلقة والتاريخ من
  الجلسة والخادم فقط — لا يقبل المسار معرّف حلقة ولا تاريخاً من العميل،
  فلا يستطيع معلّم توليد رمز لحلقة غيره. الرمز يدور كل ٣٠ ثانية؛ العميل
  يجدّده عند expiresAt.
*/
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  // التجديد كل ٣٠ ثانية = ١٢٠/ساعة؛ سقف ٦٠٠ يترك هامشاً لإعادة التحميل والتبويبات المتعددة
  if (!(await checkRateLimit(`attendance-qr:${teacher.id}`, 600, 3600))) return rateLimited();

  try {
    const enabled = await qrAttendanceEnabledForHalaqah(teacher.halaqahId);
    // ?probe=1: هل الميزة مفعّلة؟ (لإظهار الزر) — بلا توليد رمز
    if (new URL(request.url).searchParams.get("probe") === "1") return Response.json({ enabled });
    if (!enabled) return Response.json({ enabled: false }, { status: 404 });
    const now = Date.now();
    const today = riyadhTodayISO();
    const token = createCheckinToken(await checkinSecret(), teacher.halaqahId, today, now);
    return Response.json({
      enabled: true,
      token,
      path: checkinPath(token),
      date: today,
      windowMs: CHECKIN_WINDOW_MS,
      expiresAt: windowEndsAt(now),
    });
  } catch (error) {
    await logServerError("attendance-qr:get", error);
    throw error;
  }
}
