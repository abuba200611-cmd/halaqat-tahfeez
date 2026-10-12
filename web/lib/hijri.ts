/*
  STEP 63 — الشهر الهجري (تقويم أم القرى) لمفتاح الخطة الشهرية. منطق نقي
  بلا قاعدة بيانات. مفتاح الشهر "YYYY-MM" هجري (مثل "1448-04")، أما تواريخ
  الأوراد فميلادية YYYY-MM-DD، فنحوّل بينهما هنا فقط. نستخدم
  Intl.DateTimeFormat بتقويم islamic-umalqura وأرقام لاتينية ليسهل التحليل.
*/

const HIJRI_FORMAT = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
  timeZone: "UTC",
  year: "numeric",
  month: "numeric",
  day: "numeric",
});

export const HIJRI_MONTH_NAMES: readonly string[] = [
  "محرّم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوّال",
  "ذو القعدة",
  "ذو الحجة",
];

/** حدود السنوات التي يغطيها جدول أم القرى في ICU — خارجها نرفض المفتاح بدل حساب خاطئ */
const MIN_YEAR = 1300;
const MAX_YEAR = 1600;
const DAY_MS = 86400000;
const SYNODIC_MONTH_DAYS = 29.530588;
/** أول محرّم سنة ١ هـ تقريباً = 622-07-16 ميلادي */
const HIJRI_EPOCH_MS = Date.UTC(622, 6, 16);

export type HijriParts = { year: number; month: number; day: number };

function isoToUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

function msToISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** YYYY-MM-DD صالح تقويمياً */
function isValidISO(iso: unknown): iso is string {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const ms = isoToUtcMs(iso);
  return !Number.isNaN(ms) && msToISO(ms) === iso;
}

/** التاريخ الهجري (أم القرى) ليوم ميلادي معيّن YYYY-MM-DD (يوم تقويمي كامل بلا إزاحة توقيت) */
export function hijriPartsOfISO(iso: string): HijriParts {
  if (!isValidISO(iso)) throw new Error("تاريخ غير صحيح");
  const parts = HIJRI_FORMAT.formatToParts(new Date(isoToUtcMs(iso) + DAY_MS / 2));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

export function formatMonthKey(year: number, month: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** مفتاح الشهر الهجري "YYYY-MM" ليوم ميلادي */
export function hijriMonthOfISO(iso: string): string {
  const { year, month } = hijriPartsOfISO(iso);
  return formatMonthKey(year, month);
}

/** يحلّل مفتاح شهر "1448-04" — null لو الصيغة أو المدى غير صالح */
export function parseMonthKey(key: unknown): { year: number; month: number } | null {
  if (typeof key !== "string") return null;
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12 || year < MIN_YEAR || year > MAX_YEAR) return null;
  return { year, month };
}

export function isValidMonthKey(key: unknown): key is string {
  return parseMonthKey(key) !== null;
}

/** مفتاح الشهر السابق (-1) أو التالي (+1)؛ null عند الخروج عن المدى المدعوم */
export function shiftMonthKey(key: string, delta: number): string | null {
  const parsed = parseMonthKey(key);
  if (!parsed) return null;
  const index = parsed.year * 12 + (parsed.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const next = formatMonthKey(year, month);
  return parseMonthKey(next) ? next : null;
}

/** اسم الشهر مع السنة، مثل "ربيع الآخر ١٤٤٨ هـ" */
export function monthLabel(key: string): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  const year = new Intl.NumberFormat("ar-SA", { useGrouping: false }).format(parsed.year);
  return `${HIJRI_MONTH_NAMES[parsed.month - 1]} ${year} هـ`;
}

export type MonthRange = { start: string; end: string; days: number };

/**
 * النطاق الميلادي لشهر هجري: أول يوم وآخر يوم (شاملان). نقدّر التاريخ من
 * متوسط طول الشهر القمري ثم نضبطه يوماً بيوم حتى نصل لأول الشهر فعلاً
 * (الفرق عن التقدير يوم أو يومان على الأكثر)، وآخره = آخر يوم ما زال فيه.
 */
export function hijriMonthRange(key: string): MonthRange {
  const parsed = parseMonthKey(key);
  if (!parsed) throw new Error("شهر غير صحيح");

  const monthsSinceEpoch = (parsed.year - 1) * 12 + (parsed.month - 1);
  let ms = HIJRI_EPOCH_MS + Math.round(monthsSinceEpoch * SYNODIC_MONTH_DAYS) * DAY_MS;

  // نتجه نحو الشهر المطلوب (المفاتيح نصية متساوية الطول فمقارنتها ترتيبية صحيحة)
  for (let guard = 0; guard < 60 && hijriMonthOfISO(msToISO(ms)) !== key; guard++) {
    ms += (hijriMonthOfISO(msToISO(ms)) < key ? 1 : -1) * DAY_MS;
  }
  if (hijriMonthOfISO(msToISO(ms)) !== key) throw new Error("تعذّر حساب نطاق الشهر");

  while (hijriMonthOfISO(msToISO(ms - DAY_MS)) === key) ms -= DAY_MS;
  const startMs = ms;
  while (hijriMonthOfISO(msToISO(ms + DAY_MS)) === key) ms += DAY_MS;

  return { start: msToISO(startMs), end: msToISO(ms), days: Math.round((ms - startMs) / DAY_MS) + 1 };
}

/** نسبة ما انقضى من الشهر (٠..١) حتى `today` شاملاً — قبل بدايته ٠، وبعد نهايته ١ */
export function elapsedFraction(range: MonthRange, today: string): number {
  if (today < range.start) return 0;
  if (today >= range.end) return 1;
  const elapsed = Math.round((isoToUtcMs(today) - isoToUtcMs(range.start)) / DAY_MS) + 1;
  return elapsed / range.days;
}
