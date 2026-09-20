import "server-only";

import * as Sentry from "@sentry/nextjs";
import { clientIp } from "./client-ip";
import { safeEqual } from "./safe-equal";
import { checkLinkRateLimit, recordFailedLinkAttempt } from "./db";

/** ثواني تظهر بترويسة Retry-After عند 429 — تطابق نافذة الحدّ بـlib/db.ts */
const LINK_RETRY_AFTER_SECONDS = 60 * 60;

/**
 * تحقّق موحّد من x-link-secret لكل المسارات الستة تحت /api/link، يشمل
 * حماية الفيضان (STEP 29 — F-02 Tier 1). مجمَّع هنا بدل تكراره ٦ مرات
 * تحديداً لأن الادّعاء المركزي لهذا التصميم — "يستحيل أن يحجب هذا الحدّ
 * مستدعياً شرعياً" — لا يعيش في توقيع دالة، بل بترتيب التنفيذ: النجاح
 * يخرج مبكراً بلا فحص وبلا تسجيل. مع نسخ يدوية متعددة يُحفَظ هذا الشرط
 * بالنسخ واللصق فقط، ونسخة واحدة منحرفة (تسجّل عند النجاح مثلاً) تعني
 * أن ذلك المسار يبدأ يحجب مستدعياً شرعياً بصمت — وهي بالضبط الكارثة
 * التي صُمِّمت هذي الطبقة لجعلها مستحيلة.
 *
 * (هذا يُغلق F-10 — تكرار فحص السرّ — عرَضاً لهذي المسارات الستة تحديداً،
 * كأثر جانبي لتجميع منطق الحدّ، لا كمعالجة مقصودة لـF-10 نفسه.)
 *
 * يرجع Response جاهزاً (401 أو 429) لو وجب رفض الطلب، أو null لو نجحت
 * المطابقة — عندها يكمل الـroute فوراً بلا أي كلفة DB إضافية.
 */
export async function requireLinkSecret(request: Request, endpoint: string): Promise<Response | null> {
  const secret = request.headers.get("x-link-secret");
  const expected = process.env.LINK_SECRET;
  if (secret && expected && safeEqual(secret, expected)) {
    return null;
  }

  const ip = clientIp(request);

  try {
    const allowed = await checkLinkRateLimit(ip);
    if (!allowed) {
      return Response.json(
        { error: "محاولات كثيرة، حاول لاحقاً" },
        { status: 429, headers: { "Retry-After": String(LINK_RETRY_AFTER_SECONDS) } },
      );
    }
    await recordFailedLinkAttempt(ip, endpoint);
  } catch (error) {
    // خطأ DB (مثل جدول link_attempts غير موجود بعد على هذي القاعدة) لا
    // يجوز أن يتحوّل لـ500 ولا أن يُبتلَع صامتاً — يُرفَع لـSentry ليكون
    // مرئياً، ثم يُرجَع 401 العادي (نفس استجابة الفشل الطبيعية، بلا أي
    // فرق يكشف للمهاجم أن الحدّ نفسه معطوب).
    Sentry.captureException(error);
  }

  return Response.json({ error: "غير مصرّح" }, { status: 401 });
}

// عنوان IP العميل — منقولة لـlib/client-ip.ts (STEP 33) لتُستخدَم مصدراً
// وحيداً مع مسارات جديدة لا علاقة لها بـLINK_SECRET؛ يُعاد تصديرها هنا
// فقط حفاظاً على استيراد requireLinkSecret والاختبار القائم بلا تغيير.
export { clientIp } from "./client-ip";
