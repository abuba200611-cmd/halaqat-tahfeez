/*
  تقسيم تنقّل لوحة المطوّر للجوال: شريط سفلي ثابت بأسلوب التطبيقات الأصلية —
  ٤ خانات مباشرة (نظرة عامة، الجوامع، طلبات الجوامع، المزيد) وزر دائري
  مرتفع في فتحة بالمنتصف للإجراء الأهم (البلاغات). بقية الصفحات داخل ورقة
  «المزيد» — فلا يبقى أي عنصر تنقّل بلا منفذ على الجوال، والديسكتوب يبقى
  على السايدبار بالقائمة الكاملة نفسها.
*/

export type DevNavItem = { id: string; href: string; label: string };

/** كل صفحات اللوحة عدا الإعدادات (تُثبَّت أسفل السايدبار دائماً) */
export const DEV_NAV_ITEMS: DevNavItem[] = [
  { id: "overview", href: "/dev", label: "نظرة عامة" },
  { id: "mosques", href: "/dev/mosques", label: "الجوامع" },
  { id: "mosque-requests", href: "/dev/mosque-requests", label: "طلبات الجوامع" },
  { id: "associations", href: "/dev/associations", label: "الجمعيات" },
  { id: "users", href: "/dev/users", label: "المستخدمون" },
  { id: "reports", href: "/dev/reports", label: "البلاغات" },
  { id: "health", href: "/dev/health", label: "الصحة" },
  { id: "suggestions", href: "/dev/suggestions", label: "الاقتراحات" },
  { id: "agent-lessons", href: "/dev/agent-lessons", label: "دروس الإيجنت" },
  { id: "whatsapp", href: "/dev/whatsapp", label: "صادر واتساب" },
  { id: "audit", href: "/dev/audit", label: "سجل التدقيق" },
  { id: "help", href: "/dev/help", label: "كيف أستخدم اللوحة؟" },
];

/** الإعدادات — أسفل السايدبار للديسكتوب، وضمن ورقة «المزيد» للجوال */
export const DEV_SETTINGS_ITEM: DevNavItem = { id: "settings", href: "/dev/settings", label: "الإعدادات" };

/** خانات الشريط السفلي بالترتيب (الخانة الرابعة «المزيد» يرسمها الشريط نفسه) */
const BAR_IDS = ["overview", "mosques", "mosque-requests"] as const;

/** زر الفتحة الدائري بالمنتصف — الإجراء الأهم: البلاغات */
export const DEV_CENTER_ID = "reports";

export type DevMobileNav = {
  /** عناصر الشريط السفلي المباشرة (٣ — «المزيد» تُضاف بالقالب) */
  bar: DevNavItem[];
  /** زر الفتحة بالمنتصف — null لو غاب من القائمة الممرَّرة */
  center: DevNavItem | null;
  /** محتويات ورقة «المزيد» بترتيب القائمة الكاملة */
  more: DevNavItem[];
};

/** القائمة الكاملة للجوال = كل الصفحات INCLUDING الإعدادات داخل «المزيد» */
export function splitDevMobileNav(items: DevNavItem[] = [...DEV_NAV_ITEMS, DEV_SETTINGS_ITEM]): DevMobileNav {
  const barIds = new Set<string>(BAR_IDS);
  const bar = items.filter((item) => barIds.has(item.id));
  const center = items.find((item) => item.id === DEV_CENTER_ID) ?? null;
  const more = items.filter((item) => !barIds.has(item.id) && item.id !== DEV_CENTER_ID);
  return { bar, center, more };
}
