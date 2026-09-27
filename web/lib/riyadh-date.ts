/*
  تاريخ اليوم بتوقيت الرياض (STEP 54) — للتذكير اليومي فقط، حتى لا يُحسب
  "اليوم" بتوقيت UTC (يوم كامل ونصف الفارق في أسوأ الحالات، فيرسل التذكير
  قبل نصف الليل بالرياض بساعات أو بعده). Asia/Riyadh بلا توقيت صيفي، لكن
  Intl.DateTimeFormat أوثق من حساب إزاحة يدوية (UTC+3 ثابت) لأنه لا يفترض
  ثبات الإزاحة، ويطابق نفس نمط toHijriLabel/toISOString المستخدم بالمشروع.
*/
export function riyadhTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
