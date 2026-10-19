/*
  B3 — تصنيف المراجعة بالمسمّيات التقليدية: سبق (الحفظ الجديد، قائم
  أصلاً بقسم الحفظ)، سبقي (مراجعة قريبة على آخر ما حُفظ — آخر جزء
  افتراضياً)، منزل (مراجعة بعيدة على المحفوظ القديم بالتناوب).

  التصنيف اختياري دائماً: null = مقطع بلا تصنيف، والصفوف القديمة تبقى
  صحيحة بلا أي قيمة. التحقّق هنا (مصدر الحقيقة) ويُعاد استخدامه بنصوصه
  نفسها بالواجهة — نفس مبدأ lib/ward-ayah.ts.
*/
import { juzOfPage, juzToPages } from "./quran";
import { formatReviewSegments } from "./ward-ayah";
import type { PageRange, ReviewTrack, WardLog } from "./types";

export type ReviewTrackCounts = {
  /** صفحات المراجعة المصنَّفة سبقي داخل النافذة */
  sabqi: number;
  /** صفحات المراجعة المصنَّفة منزل داخل النافذة */
  manzil: number;
  /** صفحات مراجعة بلا تصنيف (أوراد قديمة أو مقاطع تركت فارغة) */
  untagged: number;
};

export const REVIEW_TRACK_LABEL: Record<ReviewTrack, string> = {
  sabqi: "سبقي",
  manzil: "منزل",
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
    throw new Error(`تصنيف غير صحيح للمقطع ${i + 1} — سبقي أو منزل فقط`);
  });
}

/**
 * أول صفحة «لسبقي» — بداية الجزء الذي فيه أبعد صفحة محفوظة (آخر جزء
  افتراضياً): كل مراجعة على هذه الصفحة أو بعدها سبقية، وما قبلها منزل.
  لا محفوظ بعد؟ الصفحة 1 — كل المراجعة قريبة بطبيعة الحال.
 */
export function recentReviewStartPage(hifzRanges: (PageRange | null)[]): number {
  let maxPage = 0;
  for (const range of hifzRanges) {
    if (!range) continue;
    const to = Math.min(604, Math.max(range.from, range.to));
    if (to > maxPage) maxPage = to;
  }
  if (maxPage === 0) return 1;
  return juzToPages(juzOfPage(maxPage), juzOfPage(maxPage)).from;
}

/** اقتراح تصنيف مقطع مراجعة: داخل نطاق السبقي → سبقي، وإلا منزل */
export function suggestReviewTrack(segment: PageRange, recentFrom: number): ReviewTrack {
  const from = Math.max(1, Math.min(segment.from, segment.to));
  return from >= recentFrom ? "sabqi" : "manzil";
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
 * نص مقاطع المراجعة مع تصنيف كل مقطع بين قوسين — «الملك 1–15 (سبقي)،
 * البقرة 5–20 (منزل)». مقطع بلا تصنيف يُعرض بدونه. الوارد بلا مقاطع
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
