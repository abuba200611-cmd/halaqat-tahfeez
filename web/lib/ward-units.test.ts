import { describe, expect, it } from "vitest";
import { WARD_UNIT_LABEL_AR, formatWardByUnit, parseHifzPagesInput, wholeSurahRange } from "./ward-units";
import { juzToPages } from "./quran";
import type { AyahRange, PageRange } from "./types";

/*
  001 T006 — وحدة قياس الورد حسب الفئة: العرض بكل وحدة دون فقد —
  الورد القديم بلا آيات يُعرض بكل الوحدات (FR-006/FR-007). التحويل
  صفحات→آيات واختباره (round-trip) في quran-surahs.test.ts.
*/

const FILI_1_5: AyahRange = { fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 };
const FILI_PAGE: PageRange = { from: 603, to: 603 };

describe("formatWardByUnit — عرض الورد بوحدة الفئة", () => {
  it("surah_ayah: سورة وآيات كما اليوم", () => {
    expect(formatWardByUnit("surah_ayah", FILI_PAGE, FILI_1_5)).toBe("الفيل 1–5");
  });

  it("ayah_page: الآيات مع عدد الصفحات المقابل (US3 سيناريو ٤)", () => {
    const pages: PageRange = { from: 603, to: 604 };
    expect(formatWardByUnit("ayah_page", pages, { fromSurah: 105, fromAyah: 1, toSurah: 114, toAyah: 6 })).toBe(
      "الفيل 1 – الناس 6 · 2 صفحة",
    );
  });

  it("page_wajh: ٣ أوجه (ص ٥٠٢–٥٠٤) ووجه واحد باسمه", () => {
    expect(formatWardByUnit("page_wajh", { from: 502, to: 504 }, null)).toBe("3 أوجه (ص 502–504)");
    expect(formatWardByUnit("page_wajh", { from: 603, to: 603 }, FILI_1_5)).toBe("وجه 603");
  });

  it("wajh_juz: جزء كامل يُعرض باسمه، وما دونه بالأوجه", () => {
    const juz30 = juzToPages(30, 30);
    expect(formatWardByUnit("wajh_juz", juz30, null)).toBe("جزء 30");
    expect(formatWardByUnit("wajh_juz", { from: 502, to: 504 }, null)).toBe("3 أوجه (ص 502–504)");
  });

  it("ورد قديم بلا آيات (hifzAyah = null) يُعرض بكل وحدة دون فقد", () => {
    const oldRange: PageRange = { from: 502, to: 504 };
    // surah_ayah/ayah_page تسقطان على نص الصفحات القديم نفسه
    expect(formatWardByUnit("surah_ayah", oldRange, null)).toBe("صفحة 502 إلى 504 · جزء 26");
    expect(formatWardByUnit("ayah_page", oldRange, null)).toBe("صفحة 502 إلى 504 · جزء 26");
    expect(formatWardByUnit("page_wajh", oldRange, null)).toBe("3 أوجه (ص 502–504)");
    expect(formatWardByUnit("wajh_juz", oldRange, null)).toBe("3 أوجه (ص 502–504)");
  });

  it("بلا حفظ أصلاً: null", () => {
    expect(formatWardByUnit("surah_ayah", null, null)).toBeNull();
    expect(formatWardByUnit("wajh_juz", null, null)).toBeNull();
  });

  it("WARD_UNIT_LABEL_AR تسمية عربية لكل وحدة", () => {
    expect(WARD_UNIT_LABEL_AR).toEqual({
      surah_ayah: "سور وآيات",
      ayah_page: "آيات وصفحات",
      page_wajh: "صفحات وأوجه",
      wajh_juz: "أوجه وأجزاء",
    });
  });
});

describe("parseHifzPagesInput — إدخال الحفظ بالصفحات", () => {
  it("null/undefined أو حقول فارغة كلياً: null (قسم اختياري)", () => {
    expect(parseHifzPagesInput(null)).toBeNull();
    expect(parseHifzPagesInput(undefined)).toBeNull();
    expect(parseHifzPagesInput({ from: null, to: null })).toBeNull();
    expect(parseHifzPagesInput({ from: "", to: "" })).toBeNull();
  });

  it("نطاق صحيح يرجع كما هو", () => {
    expect(parseHifzPagesInput({ from: 502, to: 504 })).toEqual({ from: 502, to: 504 });
    expect(parseHifzPagesInput({ from: 604, to: 604 })).toEqual({ from: 604, to: 604 });
  });

  it("ناقص أو غير رقمي أو خارج الحدود: خطأ عربي", () => {
    expect(() => parseHifzPagesInput({ from: 502, to: null })).toThrow();
    expect(() => parseHifzPagesInput({ from: "x", to: 4 })).toThrow();
    expect(() => parseHifzPagesInput({ from: 0, to: 4 })).toThrow();
    expect(() => parseHifzPagesInput({ from: 4, to: 3 })).toThrow();
    expect(() => parseHifzPagesInput({ from: 1, to: 605 })).toThrow();
  });
});

describe("wholeSurahRange — خيار «سورة كاملة»", () => {
  it("من الآية ١ إلى آخر آية بالسورة", () => {
    expect(wholeSurahRange(105)).toEqual({ fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 });
    expect(wholeSurahRange(1)).toEqual({ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 });
    expect(wholeSurahRange(2)).toEqual({ fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 286 });
  });

  it("سورة غير صحيحة: خطأ عربي", () => {
    expect(() => wholeSurahRange(0)).toThrow();
    expect(() => wholeSurahRange(115)).toThrow();
    expect(() => wholeSurahRange(2.5)).toThrow();
  });
});
