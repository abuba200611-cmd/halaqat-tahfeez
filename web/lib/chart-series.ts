/*
  تشكيل سلاسل بيانات الرسوم (مواصفة 003) — منطق نقي بلا React ولا قاعدة،
  يُختبر مباشرة ويُعاد استعماله بكل اللوحات. التواريخ نصوص ISO تقويمية
  (YYYY-MM-DD) محسوبة بتوقيت الرياض عند حدّ الاستعلام (riyadhTodayISO
  وأعمدة date المخزَّنة محلياً)، والدوال هنا تحسب عليها بحساب UTC خالص
  فلا يتأثر الناتج بمنطقة زمن الجهاز.
*/

/** نقطة سلسلة يومية (كيان المواصفة) */
export type DailyPoint = { date: string; value: number };

/** نقطة سلسلة فئوية (كيان المواصفة) */
export type CategoryPoint = { label: string; value: number };

/** التاريخ بعد `days` يوماً (قد يكون سالباً) — حساب تقويمي على نص ISO بلا منطقة زمنية للجهاز */
export function addDaysISO(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** فرق الأيام to − from (يوماماً) */
export function daysBetweenISO(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

/** بداية أسبوع ISO (الأحد) الذي يقع فيه التاريخ */
export function weekStartISO(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDaysISO(date, -weekday);
}

/** تسمية محور مختصرة «يوم/شهر» بلا حشو أصفار (مثل 25/10) */
export function dayMonthLabel(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}`;
}

/**
 * سلسلة يومية كثيفة من from إلى to (شاملة الطرفين) مرتّبة من الأقدم إلى
 * الأحدث: كل يوم بلا صفوف قيمته 0، وقيم اليوم المكرّر تُجمع، وما خارج
 * الفترة يُهمل. بداية بعد النهاية = سلسلة فارغة.
 */
export function fillDailySeries(rows: { date: string; value: number }[], from: string, to: string): DailyPoint[] {
  const days = daysBetweenISO(from, to);
  if (days < 0) return [];

  const byDate = new Map<string, number>();
  for (const row of rows) byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.value);

  return Array.from({ length: days + 1 }, (_, i) => {
    const date = addDaysISO(from, i);
    return { date, value: byDate.get(date) ?? 0 };
  });
}

/**
 * تجميع أسبوعي (الأحد بداية الأسبوع) لآخر `weeks` أسبوعاً ending بأسبوع
 * `today`: قيمة كل أسبوع = عدد الصفوف التي تاريخه فيه، والصفوف خارج
 * النافذة تُهمل. التسمية أول يوم بالأسبوع بصيغة «يوم/شهر».
 */
export function weeklyBuckets(rows: { date: string }[], weeks: number, today: string): CategoryPoint[] {
  const current = weekStartISO(today);
  const starts = Array.from({ length: weeks }, (_, i) => addDaysISO(current, -7 * (weeks - 1 - i)));
  const indexByStart = new Map(starts.map((start, i) => [start, i]));
  const values = new Array<number>(weeks).fill(0);

  for (const row of rows) {
    const index = indexByStart.get(weekStartISO(row.date));
    if (index !== undefined) values[index] += 1;
  }

  return starts.map((start, i) => ({ label: dayMonthLabel(start), value: values[i] }));
}

/**
 * أفضل n عنصراً (أعلى قيمة) ثم الباقي مجمّعاً في عنصر واحد بـ`otherLabel`
 * يُلحق في الآخر. عند التساوي يرتّب بالتسمية (عربي) لثبات الترتيب. لا
 * يظهر «أخرى» إن لم يبقَ شيء.
 */
export function topNWithOther(items: CategoryPoint[], n: number, otherLabel: string): CategoryPoint[] {
  const sorted = [...items].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ar"));
  const keep = Math.max(0, n);
  const head = sorted.slice(0, keep);
  const rest = sorted.slice(keep);
  if (rest.length === 0) return head;
  return [...head, { label: otherLabel, value: rest.reduce((sum, item) => sum + item.value, 0) }];
}

/** نسبة مئوية مقرّبة آمنة: 0 حين الإجمالي 0 (لا قسمة على صفر) */
export function safePct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
