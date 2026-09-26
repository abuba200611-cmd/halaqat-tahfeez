import { describe, expect, it } from "vitest";
import {
  SURAH_AYAH_COUNTS,
  SURAH_COUNT,
  SURAH_NAMES,
  TOTAL_AYAHS,
  TOTAL_MUSHAF_PAGES,
  allSurahs,
  globalAyahOrder,
  isValidAyah,
  isValidSurah,
  pageOfAyah,
  pageRangeOfAyahRange,
  surahAyahCount,
  surahName,
} from "./quran-surahs";

describe("بيانات المصحف الثابتة", () => {
  it("١١٤ سورة بالضبط", () => {
    expect(SURAH_COUNT).toBe(114);
    expect(SURAH_NAMES.length).toBe(114);
    expect(SURAH_AYAH_COUNTS.length).toBe(114);
  });

  it("٦٢٣٦ آية بالضبط (مجموع آيات كل السور)", () => {
    expect(TOTAL_AYAHS).toBe(6236);
    expect(SURAH_AYAH_COUNTS.reduce((a, b) => a + b, 0)).toBe(6236);
  });

  it("الفاتحة ١:١ بصفحة ١", () => {
    expect(pageOfAyah(1, 1)).toBe(1);
  });

  it("البقرة ٢:١ بصفحة ٢", () => {
    expect(pageOfAyah(2, 1)).toBe(2);
  });

  it("الملك ٦٧:١ بصفحة ٥٦٢", () => {
    expect(pageOfAyah(67, 1)).toBe(562);
  });

  it("آخر آية بالمصحف (الناس ١١٤:٦) بصفحة ٦٠٤", () => {
    expect(surahAyahCount(114)).toBe(6);
    expect(pageOfAyah(114, 6)).toBe(604);
  });

  it("كل الصفحات من ١ إلى ٦٠٤ قابلة للوصول ومتصاعدة مع ترتيب المصحف", () => {
    expect(TOTAL_MUSHAF_PAGES).toBe(604);
    expect(pageOfAyah(1, 1)).toBe(1);
    // آخر آية بكل سورة يجب أن تقع بصفحة >= أول آية بنفس السورة
    for (let s = 1; s <= 114; s++) {
      const first = pageOfAyah(s, 1);
      const last = pageOfAyah(s, surahAyahCount(s));
      expect(last).toBeGreaterThanOrEqual(first);
    }
  });

  it("أسماء السور: الفاتحة، البقرة، الملك، الناس بمواضعها الصحيحة", () => {
    expect(surahName(1)).toBe("الفاتحة");
    expect(surahName(2)).toBe("البقرة");
    expect(surahName(67)).toBe("الملك");
    expect(surahName(114)).toBe("الناس");
  });

  it("allSurahs ترجع ١١٤ عنصراً مرتّبة برقم السورة", () => {
    const list = allSurahs();
    expect(list.length).toBe(114);
    expect(list[0]).toEqual({ number: 1, name: "الفاتحة", ayahCount: 7 });
    expect(list[113]).toEqual({ number: 114, name: "الناس", ayahCount: 6 });
  });

  it("isValidSurah / isValidAyah يرفضان القيم خارج الحدود", () => {
    expect(isValidSurah(0)).toBe(false);
    expect(isValidSurah(115)).toBe(false);
    expect(isValidSurah(67)).toBe(true);
    expect(isValidAyah(67, 30)).toBe(true);
    expect(isValidAyah(67, 31)).toBe(false); // سورة الملك فيها ٣٠ آية فقط
    expect(isValidAyah(67, 0)).toBe(false);
  });

  it("globalAyahOrder يحافظ على ترتيب المصحف بين موضعين", () => {
    expect(globalAyahOrder(1, 1)).toBeLessThan(globalAyahOrder(2, 1));
    expect(globalAyahOrder(2, 286)).toBeLessThan(globalAyahOrder(3, 1));
    expect(globalAyahOrder(67, 1)).toBeLessThan(globalAyahOrder(67, 30));
  });

  it("pageRangeOfAyahRange يحسب نطاق صفحات نص ورد كامل", () => {
    // الملك كاملة (٦٧:١ إلى ٦٧:٣٠) — صفحة البداية ٥٦٢
    const range = pageRangeOfAyahRange(67, 1, 67, 30);
    expect(range.from).toBe(562);
    expect(range.to).toBeGreaterThanOrEqual(562);
  });
});
