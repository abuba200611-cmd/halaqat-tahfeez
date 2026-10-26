/*
  وحدة قياس الورد حسب فئة الحلقة (001 US3): التخزين يبقى سورة/آية + صفحات
  كما هو دائماً؛ هذه الطبقة النقية تتولّى الإدخال بالصفحات (تحويله إلى نطاق
  آيات عبر ayahRangeOfPageRange في المسار) وعرض الورد المخزَّن بوحدة
  الفئة دون فقد أي معلومة — الورد القديم بلا آيات يُعرض بكل الوحدات (FR-007).
  «وجه» = صفحة مصحف كاملة (٦٠٤ وجه) و«جزء» = حدود الأجزاء الثلاثين
  (قرار المالك Q3) — لا دقة تخزين جديدة تلزم.
*/
import { TOTAL_MUSHAF_PAGES, isValidSurah, surahAyahCount } from "./quran-surahs";
import { formatPages, juzLabel, juzesOfRange, juzToPages } from "./quran";
import type { AyahRange, PageRange } from "./types";
import { formatAyahRange } from "./ward-ayah";
import type { WardUnit } from "./halaqah-stage";

export const WARD_UNIT_LABEL_AR: Record<WardUnit, string> = {
  surah_ayah: "سور وآيات",
  ayah_page: "آيات وصفحات",
  page_wajh: "صفحات وأوجه",
  wajh_juz: "أوجه وأجزاء",
};

/** نطاق سورة كاملة (الآية ١ → آخر آية) — خيار «سورة كاملة» بنموذج تسجيل المعلّم */
export function wholeSurahRange(surah: number): AyahRange {
  if (!isValidSurah(surah)) throw new Error("سورة غير صحيحة");
  return { fromSurah: surah, fromAyah: 1, toSurah: surah, toAyah: surahAyahCount(surah) };
}

/**
 * يتحقق من إدخال «حفظ بالصفحات» {from, to} (ثانوي/جامعي) — نفس أسلوب
 * parseAyahRange: null لو القسم فارغ كلياً (اختياري)، وخطأ عربي دقيق
 * لأي حالة غير صحيحة. يرجع نطاق الصفحات كما هو؛ المستدعي يحوّله إلى
 * نطاق آيات عبر ayahRangeOfPageRange ثم parseAyahRange.
 */
export function parseHifzPagesInput(input: unknown): PageRange | null {
  if (input === null || input === undefined) return null;
  const raw = input as { from?: unknown; to?: unknown };
  const empty = (raw.from == null || raw.from === "") && (raw.to == null || raw.to === "");
  if (empty) return null;
  if (raw.from == null || raw.to == null || !Number.isInteger(Number(raw.from)) || !Number.isInteger(Number(raw.to))) {
    throw new Error("أكمل اختيار الصفحات بقسم الحفظ");
  }
  const from = Number(raw.from);
  const to = Number(raw.to);
  if (from < 1 || to < from || to > TOTAL_MUSHAF_PAGES) {
    throw new Error("نطاق الصفحات خارج حدود المصحف");
  }
  return { from, to };
}

/** نص عرض الأوجه: «وجه ٥٠٣» للواحد (الوجه يُسمّى بصفحته) و«٣ أوجه (ص ٥٠٢–٥٠٤)» لما فوقه */
function formatWajhRange(range: PageRange): string {
  const count = range.to - range.from + 1;
  if (count === 1) return `وجه ${range.from}`;
  return `${count} أوجه (ص ${range.from}–${range.to})`;
}

/** أجزاء كاملة بالضبط يغطيها النطاق (حدود الأجزاء الثلاثين) — وإلا null */
function fullJuzesOfRange(range: PageRange): number[] | null {
  const juzes = juzesOfRange(range.from, range.to);
  const first = juzToPages(juzes[0], juzes[0]);
  const last = juzToPages(juzes[juzes.length - 1], juzes[juzes.length - 1]);
  return range.from === first.from && range.to === last.to ? juzes : null;
}

/** نص الصفحات القديم نفسه (hifzRangeText) — سقوط الورد بلا آيات بأي وحدة */
function pagesFallbackText(range: PageRange): string {
  return `صفحة ${range.from} إلى ${range.to} · ${juzLabel(juzesOfRange(range.from, range.to))}`;
}

/**
 * يعرض نطاق حفظ الورد بوحدة فئة الحلقة — أي وحدة كانت، الورد المخزَّن
 * بالصفحات فقط (قديم) يُعرض دون فقد. null لو لا حفظ أصلاً.
 */
export function formatWardByUnit(unit: WardUnit, hifz: PageRange | null, hifzAyah: AyahRange | null): string | null {
  // بلا صفحات مخزَّنة: عرض الآيات إن وُجدت (حالة نظرية — الصفحات تُحسب من الآيات دائماً)
  if (!hifz) return hifzAyah ? formatAyahRange(hifzAyah) : null;
  switch (unit) {
    case "surah_ayah":
      return hifzAyah ? formatAyahRange(hifzAyah) : pagesFallbackText(hifz);
    case "ayah_page":
      return hifzAyah ? `${formatAyahRange(hifzAyah)} · ${formatPages(hifz.to - hifz.from + 1)}` : pagesFallbackText(hifz);
    case "page_wajh":
      return formatWajhRange(hifz);
    case "wajh_juz": {
      const juzes = fullJuzesOfRange(hifz);
      return juzes ? juzLabel(juzes) : formatWajhRange(hifz);
    }
  }
}
