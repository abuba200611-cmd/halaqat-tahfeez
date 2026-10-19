/*
  بوابة الصفحة الترحيبية (/welcome) — منطق صرف بلا أي استيراد من Next،
  على نمط lib/hosts.ts: يُستخدم من proxy.ts (بيئة مستقلة عن الوحدات
  الخادمية) ومن مكوّنات /welcome معاً، فيبقى القرار ومسار العودة الآمن
  متطابقين في الموضعين.
*/

/*
  كوكيات جلسات الأدوار الخمسة (أسماء lib/auth.ts وparent-auth.ts
  وmosque-auth.ts وassociation-auth.ts). وجود أيّها = زائر مسجّل دخوله.
  الأسماء منسوخة نصاً لأن proxy لا يستطيع استيراد وحدات server-only.
*/
export const SESSION_COOKIES: readonly string[] = [
  "halaqa_session", // المعلّم
  "halaqa_student", // الطالب
  "halaqa_parent", // وليّ الأمر
  "mosque_admin_session", // مدير الجامع
  "association_admin_session", // مدير الجمعية
];

/** كوكي «مرّ بالترحيب» — تضبطه صفحة /welcome عند عرضها (٣٠ يوماً) */
export const INTRO_COOKIE = "mos_intro";

/** كوكي «تسليم جوجل» الموقّع — يُضبط من callback جوجل لمن لا حساب له، ويفتح /signup بلا ترحيب */
export const GOOGLE_HANDOFF_COOKIE = "google_handoff";

export const WELCOME_PATH = "/welcome";

/**
 * مسارات التسجيل/الانضمام العامة — لا تُفتح إلا بعد المرور بالصفحة
 * الترحيبية (وجود كوكي mos_intro). صفحات الدخول واسترجاع كلمة المرور
 * والتأكيد و/api/* ليست ضمنها عمداً.
 */
export function isRegistrationPath(pathname: string): boolean {
  return (
    pathname === "/signup" ||
    pathname === "/student-join" ||
    pathname === "/student-link" ||
    pathname === "/parent/join" ||
    pathname === "/j" ||
    pathname.startsWith("/j/")
  );
}

/**
 * مسار عودة آمن لمعامل ?next=: نسبي لنفس الموقع فقط — يبدأ بـ"/" ولا
 * يبدأ بـ"//" أو "/\" (تحايل بروتوكول-نسبي إلى مستضيج آخر)، وبلا محارف
 * تحكم. أي شيء آخر يُهمَل (يرجع null).
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\r\n\t\0]/.test(raw)) return null;
  return raw;
}
