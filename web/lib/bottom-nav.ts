/**
 * تقسيم عناصر الشريط السفلي للجوال: ما يتّسع (حدّ أقصى 5 خانات) يظهر مباشرة،
 * وإن زاد العدد يأخذ «المزيد» الخانة الأخيرة ويُحال الباقي إلى ورقته —
 * فلا يبقى أي عنصر تنقّل بلا منفذ على الجوال.
 */
export function splitBottomNav<T>(items: T[], maxSlots = 5): { primary: T[]; overflow: T[] } {
  if (items.length <= maxSlots) return { primary: items, overflow: [] };
  return { primary: items.slice(0, maxSlots - 1), overflow: items.slice(maxSlots - 1) };
}
