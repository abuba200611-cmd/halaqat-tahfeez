import { describe, expect, it } from "vitest";
import { JUZ_CELL_LABEL, computeJuzProgress, formatJuzFraction } from "./juz-progress";
import { TOTAL_PAGES } from "./quran";
import type { PageRange } from "./types";

/*
  B3 — حساب تقدّم الأجزاء من نطاقات الحفظ. حدود الأجزاء بمصحف المدينة
  (الجزء ١ = صفحات ١–٢١، الجزء ٢ يبدأ صفحة ٢٢، الجزء ٣٠ = ٥٨٢–٦٠٤)
  تأتي من lib/quran.ts ومُختبرة هناك — هنا نختبر التجميع فوقها.
*/

const range = (from: number, to: number): PageRange => ({ from, to });

describe("computeJuzProgress", () => {
  it("بلا حفظ: صفر صفحات وكل الخانات «لم يبدأ»", () => {
    const progress = computeJuzProgress([]);
    expect(progress.pagesMemorized).toBe(0);
    expect(progress.juzFraction).toBe(0);
    expect(progress.cells).toHaveLength(30);
    expect(progress.cells.every((c) => c === "not_started")).toBe(true);
  });

  it("null يُتجاهل كأنه غائب", () => {
    const progress = computeJuzProgress([null, range(1, 3), null]);
    expect(progress.pagesMemorized).toBe(3);
  });

  it("المصحف كاملاً: ٦٠٤ صفحات = ٣٠ جزءاً كلها محفوظة", () => {
    const progress = computeJuzProgress([range(1, TOTAL_PAGES)]);
    expect(progress.pagesMemorized).toBe(604);
    expect(progress.juzFraction).toBe(30);
    expect(progress.cells.every((c) => c === "memorized")).toBe(true);
  });

  it("جزء واحد كامل (١–٢١): خانته محفوظة وما بعدها لم يبدأ", () => {
    const progress = computeJuzProgress([range(1, 21)]);
    expect(progress.cells[0]).toBe("memorized");
    expect(progress.cells[1]).toBe("not_started");
    expect(progress.pagesMemorized).toBe(21);
    expect(formatJuzFraction(progress.juzFraction)).toBe("1");
  });

  it("نصف جزء تقريباً: خانة «جزئي» وجزء مكافئ 0.5", () => {
    const progress = computeJuzProgress([range(1, 10)]);
    expect(progress.cells[0]).toBe("partial");
    expect(progress.cells.slice(1).every((c) => c === "not_started")).toBe(true);
    expect(formatJuzFraction(progress.juzFraction)).toBe("0.5");
  });

  it("ورد عند حدّ الجزئين (٢١–٢٢): جزءان «جزئي» معاً", () => {
    const progress = computeJuzProgress([range(21, 22)]);
    expect(progress.cells[0]).toBe("partial");
    expect(progress.cells[1]).toBe("partial");
    expect(progress.cells[2]).toBe("not_started");
  });

  it("اتحاد النطاقات المتداخلة لا يعدّ الصفحة مرتين (نفس مبدأ hifzPagesCovered)", () => {
    const progress = computeJuzProgress([range(1, 5), range(3, 8), range(582, 604)]);
    expect(progress.pagesMemorized).toBe(8 + 23);
    expect(progress.cells[0]).toBe("partial");
    expect(progress.cells[29]).toBe("memorized");
  });

  it("نطاق مقلوب يُطبَّع (من الأكبر للأصغر) ولا يُرفض", () => {
    const progress = computeJuzProgress([range(10, 5)]);
    expect(progress.pagesMemorized).toBe(6);
  });

  it("نطاق خارج المصحف يُقصّ عند الحدود", () => {
    const progress = computeJuzProgress([range(-50, 7000)]);
    expect(progress.pagesMemorized).toBe(604);
    expect(progress.cells.every((c) => c === "memorized")).toBe(true);
  });
});

describe("formatJuzFraction", () => {
  it("يحذف صفر العشري للأعداد الصحيحة", () => {
    expect(formatJuzFraction(0)).toBe("0");
    expect(formatJuzFraction(3)).toBe("3");
    expect(formatJuzFraction(30)).toBe("30");
  });

  it("يثبّت منزلة عشرية واحدة", () => {
    expect(formatJuzFraction(2.54)).toBe("2.5");
    expect(formatJuzFraction(2.55)).toBe("2.6");
    expect(formatJuzFraction(29.97)).toBe("30");
  });
});

describe("JUZ_CELL_LABEL", () => {
  it("تسميات عربية للحالات الثلاث", () => {
    expect(JUZ_CELL_LABEL.memorized).toBe("محفوظ");
    expect(JUZ_CELL_LABEL.partial).toBe("جزئي");
    expect(JUZ_CELL_LABEL.not_started).toBe("لم يبدأ");
  });
});
