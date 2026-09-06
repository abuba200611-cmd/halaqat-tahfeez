import "server-only";

/**
 * عنوان IP العميل — مصدر وحيد مشترك (STEP 33) لكل مسار جديد يحتاجه بلا
 * علاقة بـLINK_SECRET (خلافاً لـlib/link-auth.ts، الذي يبقى مسؤولاً عن
 * مسارات /api/link تحديداً). مطابقة سلوكياً للنسخ الست القائمة بمسارات
 * المصادقة (auth/login وغيرها) — لم تُمَس تلك النسخ ولن تُستورَد من هنا.
 */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
