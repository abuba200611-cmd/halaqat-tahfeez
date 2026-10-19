/*
  B3 — تقدّم الحفظ بالأجزاء. مصدر الحقيقة واحد: اتحاد نطاقات الحفظ
  (hifzFrom..hifzTo) عبر أوراد الطالب كلها — نفس مبدأ hifzPagesCovered،
  لكنه يعطي الجزء المكافئ وشبكة الثلاثين خلية بدل عدد الصفحات وحده.
  خريطة صفحة→جزء موجودة أصلاً بـlib/quran.ts (مصحف المدينة) فلا تُكرَّر هنا.
*/
import { TOTAL_JUZ, TOTAL_PAGES, juzOfPage } from "./quran";
import type { PageRange } from "./types";

export type JuzCellStatus = "memorized" | "partial" | "not_started";

export type JuzProgress = {
  /** عدد الصفحات المختلفة المحفوظة فعلاً (اتحاد النطاقات، لا مجموعها) */
  pagesMemorized: number;
  /** الجزء المكافئ كسيرورة متصلة: الصفحات × ٣٠ ÷ ٦٠٤ — لعرض «X من 30 جزء» */
  juzFraction: number;
  /** ٣٠ خانة، الفهرس 0 = الجزء 1 */
  cells: JuzCellStatus[];
};

/** كم صفحة في كل جزء — تُحسب مرة واحدة (ثابتة لمصحف المدينة) */
const PAGES_PER_JUZ = (() => {
  const counts = new Uint16Array(TOTAL_JUZ + 1);
  for (let page = 1; page <= TOTAL_PAGES; page++) counts[juzOfPage(page)]++;
  return counts;
})();

export function computeJuzProgress(hifzRanges: (PageRange | null)[]): JuzProgress {
  const covered = new Uint8Array(TOTAL_PAGES + 1);
  let pagesMemorized = 0;
  for (const range of hifzRanges) {
    if (!range) continue;
    const from = Math.max(1, Math.min(range.from, range.to));
    const to = Math.min(TOTAL_PAGES, Math.max(range.from, range.to));
    for (let p = from; p <= to; p++) {
      if (!covered[p]) {
        covered[p] = 1;
        pagesMemorized++;
      }
    }
  }

  const coveredPerJuz = new Uint16Array(TOTAL_JUZ + 1);
  for (let p = 1; p <= TOTAL_PAGES; p++) if (covered[p]) coveredPerJuz[juzOfPage(p)]++;

  const cells: JuzCellStatus[] = [];
  for (let juz = 1; juz <= TOTAL_JUZ; juz++) {
    if (coveredPerJuz[juz] >= PAGES_PER_JUZ[juz]) cells.push("memorized");
    else if (coveredPerJuz[juz] > 0) cells.push("partial");
    else cells.push("not_started");
  }

  return { pagesMemorized, juzFraction: (pagesMemorized / TOTAL_PAGES) * TOTAL_JUZ, cells };
}

/** «X من 30 جزء» برقم عشري واحد يُحذف صفره — 0 / 1 / 2.5 / 30 */
export function formatJuzFraction(juzFraction: number): string {
  const rounded = Math.round(juzFraction * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** نص حالة الخلية للأدوات التوضيحية وقراءات الشاشة */
export const JUZ_CELL_LABEL: Record<JuzCellStatus, string> = {
  memorized: "محفوظ",
  partial: "جزئي",
  not_started: "لم يبدأ",
};
