/*
  مساعدات التقييم الأسبوعي البحتة (بلا قاعدة بيانات ولا "server-only")
  — تُستخدم بالمسار والصفحة معاً: الأسبوع يبدأ السبت (عرف سعودي)،
  وتلخيص درجات الأسبوع بمجموع وترتيب.
*/

const DAY_MS = 86_400_000;

/** أقرب سبت ≤ التاريخ (بالتقويم الميلادي، بالتوقيت العالمي حسمياً) */
export function saturdayOf(date: Date): Date {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const shift = (utc.getUTCDay() + 1) % 7; // السبت→0، الأحد→1، … الجمعة→6
  return new Date(utc.getTime() - shift * DAY_MS);
}

export function isSaturday(date: Date): boolean {
  return date.getUTCDay() === 6;
}

/** YYYY-MM-DD من تاريخ (بأجزاء UTC) */
export function formatWeek(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** تاريخ صالح من YYYY-MM-DD (يُرجع بأجزاء UTC حتى تبقى المقارنات حتمية)، أو null */
export function parseWeekStart(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return formatWeek(date) === value ? date : null;
}

/** آخر count أسابيع (الأسابيع بدايتها السبت)، الأحدث أولاً — لمنتقي الأسبوع */
export function recentWeeks(count: number, today = new Date()): string[] {
  const current = saturdayOf(today);
  return Array.from({ length: count }, (_, i) => formatWeek(new Date(current.getTime() - i * 7 * DAY_MS)));
}

/** "12 أكتوبر – 18 أكتوبر" — نطاق الأسبوع محسوباً من تاريخ بدايته */
export function weekLabel(weekStart: string): string {
  const start = parseWeekStart(weekStart);
  if (!start) return weekStart;
  const end = new Date(start.getTime() + 6 * DAY_MS);
  const fmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { day: "numeric", month: "long" });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export type WeekCriterion = { id: number; name: string; maxScore: number };
export type WeekTarget = { id: number; name: string };
export type WeekEntry = { targetId: number; criterionId: number; score: number };

export type WeekSummaryRow = {
  targetId: number;
  name: string;
  total: number;
  rank: number;
};

/**
  تلخيص أسبوع: مجموع درجات كل هدف أُقيّم (لو بخلية واحدة) وترتيبه
  تنازلياً — المتساوون بالمجموع يأخذون الترتيب نفسه (ترتيب تنافسي).
  الأهداف غير المقيَّمة لا تظهر بالجدول.
*/
export function summarizeWeek(criteria: WeekCriterion[], targets: WeekTarget[], entries: WeekEntry[]): WeekSummaryRow[] {
  const names = new Map(targets.map((target) => [target.id, target.name]));
  const validCriteria = new Set(criteria.map((criterion) => criterion.id));
  const totals = new Map<number, number>();
  for (const entry of entries) {
    if (!validCriteria.has(entry.criterionId) || !names.has(entry.targetId)) continue;
    totals.set(entry.targetId, (totals.get(entry.targetId) ?? 0) + entry.score);
  }

  const rows = [...totals.entries()]
    .map(([targetId, total]) => ({ targetId, name: names.get(targetId) ?? "", total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ar"));

  let rank = 0;
  let previousTotal: number | null = null;
  return rows.map((row, index) => {
    if (row.total !== previousTotal) {
      rank = index + 1;
      previousTotal = row.total;
    }
    return { ...row, rank };
  });
}
