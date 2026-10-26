/*
  B3 — تصنيف المراجعة بالمسمّيات التقليدية: حفظ جديد (ما يُحفظ اليوم،
  قائم أصلاً بقسم الحفظ بلا مسار)، الكبرى «sabqi» (المراجعة الأولى بعد
  الحفظ الجديد مباشرة — ١٠ صفحات افتراضياً بمجاورة ما حُفظ على الجهة
  المحفوظة سابقاً، باتجاه الحفظ نفسه)، الصغرى «manzil» (ما بعد الكبرى
  من المحفوظ القديم). القيم المخزَّنة كما كانت: "sabqi" و"manzil".

  التصنيف اختياري دائماً: null = مقطع بلا تصنيف، والصفوف القديمة تبقى
  صحيحة بلا أي قيمة. التحقّق هنا (مصدر الحقيقة) ويُعاد استخدامه بنصوصه
  نفسها بالواجهة — نفس مبدأ lib/ward-ayah.ts.
*/
import { TOTAL_PAGES } from "./quran";
import { formatReviewSegments } from "./ward-ayah";
import type { PageRange, ReviewTrack, WardLog } from "./types";

export type ReviewTrackCounts = {
  /** صفحات المراجعة المصنَّفة الكبرى داخل النافذة */
  sabqi: number;
  /** صفحات المراجعة المصنَّفة الصغرى داخل النافذة */
  manzil: number;
  /** صفحات مراجعة بلا تصنيف (أوراد قديمة أو مقاطع تركت فارغة) */
  untagged: number;
};

export const REVIEW_TRACK_LABEL: Record<ReviewTrack, string> = {
  sabqi: "الكبرى",
  manzil: "الصغرى",
};

/**
 * يتحقّق من قائمة تصنيفات المقاطع القادمة من الجسم — مصفوفة محاذية
 * لمقاطع المراجعة بالعدد نفسه، كل عنصر "sabqi" أو "manzil" أو null
 * (مقطع بلا تصنيف). يرجع null لو الحقل غائب كلياً، ويرمي برسالة عربية
 * دقيقة لأي صورة أخرى.
 */
export function parseReviewTracks(input: unknown, segmentCount: number): (ReviewTrack | null)[] | null {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) throw new Error("صيغة تصنيف المراجعة غير صحيحة");
  if (input.length !== segmentCount) {
    throw new Error("عدد التصنيفات لازم يطابق عدد مقاطع المراجعة");
  }
  return input.map((value, i) => {
    if (value === null) return null;
    if (value === "sabqi" || value === "manzil") return value;
    throw new Error(`تصنيف غير صحيح للمقطع ${i + 1} — الكبرى أو الصغرى فقط`);
  });
}

/** عدد صفحات «الكبرى» الافتراضي بعد آخر حفظ (مجاورةً له باتجاه الحفظ) */
export const KUBRA_DEFAULT_PAGES = 10;

/**
 * «الكبرى» = النصف الثاني من المصحف تقريباً؟ افترض حفظاً تنازلياً (من
 * الناس إلى البقرة). هذه قاعدة السقوط عند غياب دليل الاتجاه (سجل واحد
 * أو تداخل آخر حفظ مع ما قبله)، والأغلب هنا يحفظ تنازلياً.
 */
const MUSHAF_SECOND_HALF_FROM = Math.floor(TOTAL_PAGES / 2) + 1; // 303 فأعلى

/** نطاق صفحات جاهز للاقتراح — from ≤ to دائماً */
export type KubraWindow = { from: number; to: number };

/**
 * نافذة «الكبرى»: الصفحات `pages` (١٠ افتراضياً) الملاصقة لآخر حفظ على
 * الجهة المحفوظة سابقاً. `hifzRanges` نطاقات حفظ الطالب مرتَّبة من
 * الأقدم إلى الأحدث (أورد API تصل أحدثها أولاً — اعكسها قبل التمرير).
 * الاتجاه من مقارنة آخر حفظ بما قبله: بدايته أدنى من كل ما حُفظ قبله →
 * تنازلي (الكبرى بعده صفحياً)، أعلى من كله → تصاعدي (الكبرى قبله
 * صفحياً)، وإلا قاعدة النصف الثاني أعلاه. لا حفظ إطلاقاً (أو خرجت
 * النافذة عن حدود المصحف كاملة) → null بلا اقتراح.
 */
export function kubraWindow(hifzRanges: (PageRange | null)[], pages = KUBRA_DEFAULT_PAGES): KubraWindow | null {
  const ranges = hifzRanges
    .filter((r): r is PageRange => r !== null)
    .map((r) => ({ from: Math.min(r.from, r.to), to: Math.max(r.from, r.to) }));
  if (ranges.length === 0) return null;

  const latest = ranges[ranges.length - 1];
  const earlier = ranges.slice(0, -1);
  let descending: boolean;
  if (earlier.length === 0) {
    descending = latest.from >= MUSHAF_SECOND_HALF_FROM;
  } else {
    const earlierFrom = Math.min(...earlier.map((r) => r.from));
    const earlierTo = Math.max(...earlier.map((r) => r.to));
    if (latest.from < earlierFrom) descending = true;
    else if (latest.from > earlierTo) descending = false;
    else descending = latest.from >= MUSHAF_SECOND_HALF_FROM;
  }

  if (descending) {
    const from = latest.to + 1;
    const to = Math.min(TOTAL_PAGES, latest.to + pages);
    return from > to ? null : { from, to };
  }
  const to = latest.from - 1;
  const from = Math.max(1, latest.from - pages);
  return from > to ? null : { from, to };
}

/**
 * اقتراح مسار مقطع مراجعة من نافذة «الكبرى»: يتقاطع معها بنصف صفحات
 * المقطع فأكثر → «sabqi» (الكبرى)، وإلا «manzil» (الصغرى). نافذة بلا
 * قيمة (null) → null بلا اقتراح — الاختيار الصريح لا يُمس في كل حال.
 */
export function suggestReviewTrackFor(segment: PageRange, kubra: KubraWindow | null): ReviewTrack | null {
  if (!kubra) return null;
  const from = Math.max(1, Math.min(segment.from, segment.to));
  const to = Math.min(TOTAL_PAGES, Math.max(segment.from, segment.to));
  const overlap = Math.min(to, kubra.to) - Math.max(from, kubra.from) + 1;
  if (overlap <= 0) return "manzil";
  return overlap * 2 >= to - from + 1 ? "sabqi" : "manzil";
}

/** تاريخ YYYY-MM-DD قبل `days` يوماً من `today` (حساب UTC، بلا توقيت صيفي) */
function daysBefore(today: string, days: number): string {
  return new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
}

/**
 * صفحات المراجعة لكل مسار داخل آخر `days` يوماً (شاملة اليوم). المقاطع
 * المصنَّفة تُعدّ صفحات كل مقطع على حدة من صفحاته المخزَّنة؛ ما لا تصنيف
 * له (مقاطع فارغة أو أوراد بمقطع واحد قديم قبل STEP 52) يُعدّ بالكامل
 * ضمن untagged عبر reviewPagesTotal الجاهزة.
 */
export function countReviewTrackPages(
  logs: Pick<WardLog, "date" | "reviewSegments" | "reviewSegmentTracks" | "reviewSegmentPages" | "reviewPagesTotal">[],
  days: number,
  today: string,
): ReviewTrackCounts {
  const since = daysBefore(today, days - 1);
  const counts: ReviewTrackCounts = { sabqi: 0, manzil: 0, untagged: 0 };

  for (const log of logs) {
    if (log.date < since || log.date > today) continue;

    const tracks = log.reviewSegmentTracks ?? null;
    if (log.reviewSegments && log.reviewSegments.length > 0 && tracks && tracks.length === log.reviewSegments.length) {
      let counted = 0;
      log.reviewSegments.forEach((_, i) => {
        const pages = log.reviewSegmentPages?.[i];
        const n = pages ? Math.max(0, Math.min(pages.to, 604) - Math.max(pages.from, 1) + 1) : 0;
        if (tracks[i] === "sabqi") counts.sabqi += n;
        else if (tracks[i] === "manzil") counts.manzil += n;
        else counts.untagged += n;
        counted += n;
      });
      // صفحات لم تُعدّ أعلاه (صفحات مقطع مفقودة قديمة) لا تضيع
      if (counted < log.reviewPagesTotal) counts.untagged += log.reviewPagesTotal - counted;
      continue;
    }

    counts.untagged += log.reviewPagesTotal;
  }

  return counts;
}

/**
 * نص مقاطع المراجعة مع تصنيف كل مقطع بين قوسين — «الملك 1–15 (الكبرى)،
 * البقرة 5–20 (الصغرى)». مقطع بلا تصنيف يُعرض بدونه. الوارد بلا مقاطع
 * أصلاً أو بلا أي تصنيف يرجع null ليعرض النص القديم كما هو.
 */
export function reviewTextWithTracks(log: WardLog, plainText: string | null): string | null {
  const segments = log.reviewSegments;
  const tracks = log.reviewSegmentTracks;
  if (!segments || segments.length === 0 || !tracks || tracks.length !== segments.length) return plainText;
  if (!tracks.some((t) => t !== null)) return plainText;
  return segments
    .map((segment, i) => {
      const label = tracks[i] ? ` (${REVIEW_TRACK_LABEL[tracks[i]!]})` : "";
      return `${formatReviewSegments([segment])}${label}`;
    })
    .join("، ");
}
