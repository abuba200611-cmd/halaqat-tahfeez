import { surahName, TOTAL_MUSHAF_PAGES } from "./quran-surahs";
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
};

export type ParentChildSummary = {
  streak: number;
  pagesCovered: number;
  totalPages: number;
  lastHifz: { surah: string; page: number } | null;
  wards: ParentWardRow[];
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
  };
}
