import { surahName, TOTAL_MUSHAF_PAGES } from "./quran-surahs";
import { computeJuzProgress, type JuzProgress } from "./juz-progress";
import { countReviewTrackPages, type ReviewTrackCounts } from "./review-tracks";
import {
  computeStreak,
  hifzPagesCovered,
  hifzRangeText,
  latestHifzProgress,
  reviewRangeText,
} from "./student-ward-display";
import type { WardLog, WardStatus } from "./types";

/*
  STEP 61 — ملخّص الابن لولي الأمر (قراءة فقط). يُبنى بالخادم من أوراد طالب
  واحد، ويُرجع حقولاً محسوبة فقط: لا ملاحظات المعلّم ولا الزميل ولا النص
  الحرّ للطالب ولا أي معرّف داخلي — فلا يتسرّب للولي ما لم يُقصَد عرضه.
*/

export const PARENT_WARD_DAYS = 14;

export type ParentWardRow = {
  date: string;
  hifz: string | null;
  review: string | null;
  status: WardStatus;
  /** درجة وتقدير تقييم نقاط الأخطاء (ميزة error_grading) — غائبان لورد لم يُقيَّم بالنقاط. الدرجة والتقدير فقط، لا عدّادات الأخطاء */
  score?: number;
  band?: string;
};

export type ParentChildSummary = {
  streak: number;
  pagesCovered: number;
  totalPages: number;
  lastHifz: { surah: string; page: number } | null;
  wards: ParentWardRow[];
  /** B3: شبكة الثلاثين جزءاً من نفس أوراد الحفظ — حقول محسوبة فقط كالبقية */
  juzProgress: JuzProgress;
  /** B3: صفحات مراجعة كل مسار لآخر ٧ و٣٠ يوماً */
  trackCounts: { days7: ReviewTrackCounts; days30: ReviewTrackCounts };
};

/** تاريخ YYYY-MM-DD قبل `days` يوماً من `today` (حساب تقويمي بـUTC، بلا أثر للتوقيت الصيفي) */
function daysBefore(today: string, days: number): string {
  return new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
}

export function buildParentChildSummary(logs: WardLog[], today: string): ParentChildSummary {
  const since = daysBefore(today, PARENT_WARD_DAYS - 1);
  const progress = latestHifzProgress(logs);

  const wards = logs
    .filter((l) => l.date >= since && l.date <= today)
    .sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1))
    .map((l) => ({
      date: l.date,
      hifz: hifzRangeText(l.hifz, l.hifzAyah),
      review: reviewRangeText(l),
      status: l.status,
      ...(l.errorScore !== undefined && l.errorBand ? { score: l.errorScore, band: l.errorBand } : {}),
    }));

  return {
    streak: computeStreak(
      logs.map((l) => l.date),
      today,
    ),
    pagesCovered: hifzPagesCovered(logs),
    totalPages: TOTAL_MUSHAF_PAGES,
    lastHifz: progress ? { surah: surahName(progress.surah), page: progress.page } : null,
    wards,
    juzProgress: computeJuzProgress(logs.map((l) => l.hifz)),
    trackCounts: {
      days7: countReviewTrackPages(logs, 7, today),
      days30: countReviewTrackPages(logs, 30, today),
    },
  };
}
