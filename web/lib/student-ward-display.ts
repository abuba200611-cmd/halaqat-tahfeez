/*
  عرض ورد الطالب — نصوص وحسابات مشتركة بين لوحة الطالب الرئيسية،
  صفحة "سجّل وردي"، وصفحة "أورادي" (STEP 58) — كانت مكرَّرة داخل صفحة
  واحدة فقط قبل تقسيمها لعدّة صفحات، فجُمعت هنا بدل تكرارها ثلاث مرّات.
*/
import { riyadhTodayISO } from "./riyadh-date";
import { juzLabel, juzesOfRange } from "./quran";
import { surahAtPage } from "./quran-surahs";
import type { AyahRange, PageRange, WardLog, WardStatus } from "./types";
import { formatAyahRange, formatReviewSegments } from "./ward-ayah";

export const STATUS_LABEL: Record<WardStatus, string> = {
  new: "بانتظار الاطّلاع",
  seen: "اطّلع المعلّم",
  approved: "معتمد",
  needs_revision: "يحتاج إعادة",
};

export const STATUS_STYLE: Record<WardStatus, string> = {
  new: "bg-amber-50 text-amber-700",
  seen: "bg-slate-100 text-slate-600",
  approved: "bg-emerald-50 text-emerald-600",
  needs_revision: "bg-red-50 text-red-600",
};

export function statusTone(status: WardStatus): string {
  return STATUS_STYLE[status];
}

/** الحفظ يبقى نطاقاً واحداً دائماً — الأوراد الجديدة تعرض السورة/الآية، القديمة (بلا سورة محفوظة) تُعرض بالصفحات كما كانت دائماً */
export function hifzRangeText(range: PageRange | null, ayahRange: AyahRange | null): string | null {
  if (ayahRange) return formatAyahRange(ayahRange);
  if (!range) return null;
  const juz = juzLabel(juzesOfRange(range.from, range.to));
  return `صفحة ${range.from} إلى ${range.to} · ${juz}`;
}

/** المراجعة: تفضّل مقاطع STEP 52 (مهما كان عددها)، ثم نطاق STEP 49 القديم بمقطع واحد، ثم الصفحات المجرّدة لأقدم الأوراد */
export function reviewRangeText(log: WardLog): string | null {
  if (log.reviewSegments && log.reviewSegments.length > 0) return formatReviewSegments(log.reviewSegments);
  if (log.reviewAyah) return formatAyahRange(log.reviewAyah);
  if (!log.review) return null;
  const juz = juzLabel(juzesOfRange(log.review.from, log.review.to));
  return `صفحة ${log.review.from} إلى ${log.review.to} · ${juz}`;
}

/**
 * عدد الصفحات المختلفة (distinct) التي غطّتها أوراد الحفظ عبر كل
 * الأوراد — المعتمدة وغير المعتمدة معاً، والمراجعة لا تُحتسب (STEP 58
 * تعديل): آخر صفحة وصلها الطالب لا تمثّل صفحات الحفظ الفعلية لو حفظ
 * بالقفز (مثال: ٥٨٢–٦٠٤ ثم ٥٦٠–٥٦٢ = ٢٦ صفحة محفوظة فعلاً، لا ٦٠٤).
 */
export function hifzPagesCovered(logs: WardLog[]): number {
  const pages = new Set<number>();
  for (const log of logs) {
    if (!log.hifz) continue;
    for (let p = log.hifz.from; p <= log.hifz.to; p++) pages.add(p);
  }
  return pages.size;
}

/**
 * "آخر ما وصلت" — من أحدث ورد حفظ بالتاريخ (لا بأكبر رقم صفحة وصلها
 * أي ورد سابق): طالب يحفظ بالترتيب الطبيعي غالباً، لكن لو راجع صفحة
 * أبعد سابقاً ثم رجع يحفظ صفحة أقرب، فآخر ما وصلـه فعلاً هو ورده
 * الأحدث لا أبعد صفحة سجّلها يوماً (STEP 58 تعديل). يفضّل hifzAyah إن
 * وُجدت (تحدّد السورة الدقيقة من الآية نفسها) وإلا يشتقّها من الصفحة.
 * بين وردين بنفس أحدث تاريخ يُفضَّل أولهما بترتيب logs (الأحدث إرسالاً
 * أولاً كما يُعيدها الخادم دائماً بـcreated_at DESC).
 */
export function latestHifzProgress(logs: WardLog[]): { page: number; surah: number } | null {
  const withHifz = logs.filter((l): l is WardLog & { hifz: PageRange } => l.hifz !== null);
  if (withHifz.length === 0) return null;
  const maxDate = withHifz.reduce((max, l) => (l.date > max ? l.date : max), withHifz[0].date);
  const latest = withHifz.find((l) => l.date === maxDate)!;
  const surah = latest.hifzAyah ? latest.hifzAyah.toSurah : surahAtPage(latest.hifz.to);
  return { page: latest.hifz.to, surah };
}

/**
 * أيام متتالية بها ورد مُرسل، بتوقيت الرياض (STEP 58). الانقطاع
 * الحقيقي: لو آخر تسجيل أقدم من أمس (بتوقيت الرياض) بيوم أو أكثر،
 * التتابع منقطع فعلياً والرصيد صفر — لا نستمر بعرض عدّ قديم لم يعد
 * صحيحاً لمجرّد أن آخر الأيام بينها فجوة يوم واحد فقط لم تُحسَب بعد.
 */
export function computeStreak(dates: string[], today: string = riyadhTodayISO()): number {
  const uniqueSorted = [...new Set(dates)].sort().reverse();
  if (uniqueSorted.length === 0) return 0;

  const daysSinceLast = Math.round((Date.parse(today) - Date.parse(uniqueSorted[0])) / 86400000);
  if (daysSinceLast > 1) return 0;

  let streak = 1;
  for (let i = 0; i < uniqueSorted.length - 1; i++) {
    const diffDays = Math.round((Date.parse(uniqueSorted[i]) - Date.parse(uniqueSorted[i + 1])) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
}
