/*
  منظّف دروس الدليل المشترك (بلا خادم ولا قاعدة بيانات) — الدرس يُشارك مع
  كل الجوامع فيجب أن يكون مجهّلاً: تُحذف الأسماء المسجّلة وأرقام الهواتف
  قبل الحفظ، وإن بقي بعدها رقم طويل أو اسم مسجّل يُرفض الدرس كله.
*/

/** تسوية نص للمقارنة: بلا فراغات زائدة وتشكيل موحّد */
function normalizeForMatch(value: string): string {
  return value
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * يحذف من الدرس كل اسم مسجّل (بأطوال معقولة حتى لا يبتلع النص) وكل شكل
 * شبيه برقم هاتف (سلسلة أرقام متصلة أو متقطّعة بفراغات/شرَطات طولها ٧+).
 */
export function sanitizeLesson(content: string, registeredNames: readonly string[]): string {
  let cleaned = normalizeForMatch(content);

  for (const name of registeredNames) {
    const target = normalizeForMatch(name);
    // أسماء أقصر من ٤ محارف (بعد التسوية) تُتجاهل: حذفها يمسّ كلمات عادية
    if (target.length < 4) continue;
    cleaned = cleaned.split(target).join("…");
  }

  // هاتف/رقم هوية: ٧ أرقام فأكثر متصلة أو مفصولة بفراغات أو شرَطات أو نقاط
  cleaned = cleaned.replace(/\d(?:[\d\s\-.]{5,}\d|\d{6,})/g, "…");

  return cleaned.replace(/\s+/g, " ").trim();
}

/** هل بقي في الدرس المنظّف ما يمنع مشاركته؟ — سبب الرفض أو null */
export function lessonRejectionReason(
  sanitized: string,
  registeredNames: readonly string[],
): string | null {
  if (/\d{7,}/.test(sanitized.replace(/[\s\-.]/g, ""))) {
    return "الدرس ما زال يحتوي رقماً طويلاً (هاتف أو هوية)";
  }
  const normalized = normalizeForMatch(sanitized);
  for (const name of registeredNames) {
    const target = normalizeForMatch(name);
    if (target.length >= 4 && normalized.includes(target)) {
      return "الدرس ما زال يحتوي اسماً لشخص مسجّل";
    }
  }
  return null;
}
