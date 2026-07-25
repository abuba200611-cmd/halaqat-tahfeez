export const TOTAL_PAGES = 604;
export const TOTAL_JUZ = 30;

/** أول صفحة من كل جزء في مصحف المدينة — الحدود الفعلية لا التوزيع المتساوي */
const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
] as const;

/** آخر صفحة في الجزء */
function juzEndPage(juz: number): number {
  return juz < TOTAL_JUZ ? JUZ_START_PAGES[juz] - 1 : TOTAL_PAGES;
}

/*
  جدول بحث يُبنى مرة واحدة: juzOfPage تُستدعى ملايين المرات داخل حلقات
  المطابقة، فالبحث المباشر أرخص من المرور على حدود الأجزاء في كل نداء.
*/
const PAGE_TO_JUZ = (() => {
  const table = new Uint8Array(TOTAL_PAGES + 1);
  for (let juz = 1; juz <= TOTAL_JUZ; juz++) {
    for (let page = JUZ_START_PAGES[juz - 1]; page <= juzEndPage(juz); page++) {
      table[page] = juz;
    }
  }
  return table;
})();

export function juzOfPage(page: number): number {
  if (page < 1) return 1;
  if (page > TOTAL_PAGES) return TOTAL_JUZ;
  return PAGE_TO_JUZ[page];
}

export function juzesOfRange(from: number, to: number): number[] {
  const out: number[] = [];
  for (let j = juzOfPage(from); j <= juzOfPage(to); j++) out.push(j);
  return out;
}

export function juzLabel(juzes: number[]): string {
  if (juzes.length === 0) return "—";
  if (juzes.length === 1) return `جزء ${juzes[0]}`;
  return `أجزاء ${juzes[0]}–${juzes[juzes.length - 1]}`;
}

export function formatPages(count: number): string {
  return `${count} صفحة`;
}

/** المعلّم يفكّر بالأجزاء لا بالصفحات — نحوّل مدخله إلى نطاق صفحات */
export function juzToPages(fromJuz: number, toJuz: number): { from: number; to: number } {
  const lo = Math.max(1, Math.min(fromJuz, toJuz));
  const hi = Math.min(TOTAL_JUZ, Math.max(fromJuz, toJuz));
  return { from: JUZ_START_PAGES[lo - 1], to: juzEndPage(hi) };
}
