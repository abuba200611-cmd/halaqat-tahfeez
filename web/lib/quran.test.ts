import { describe, expect, it } from "vitest";
import { juzLabel, juzOfPage, juzToPages, juzesOfRange, TOTAL_JUZ, TOTAL_PAGES } from "./quran";

describe("juzOfPage", () => {
  it("يرجع الجزء الأول لأول صفحة", () => {
    expect(juzOfPage(1)).toBe(1);
  });

  it("يرجع الجزء الثلاثين لآخر صفحة", () => {
    expect(juzOfPage(TOTAL_PAGES)).toBe(TOTAL_JUZ);
  });

  it("يثبّت الحدود لصفحة خارج المصحف بدل ما ينهار", () => {
    expect(juzOfPage(0)).toBe(1);
    expect(juzOfPage(9999)).toBe(TOTAL_JUZ);
  });

  it("يميّز حدود الأجزاء الفعلية لا التوزيع المتساوي (٦٠٤ ÷ ٣٠)", () => {
    // الجزء الثاني يبدأ صفحة ٢٢ بمصحف المدينة، لا ٢١ (604/30 ≈ 20.1)
    expect(juzOfPage(21)).toBe(1);
    expect(juzOfPage(22)).toBe(2);
  });
});

describe("juzesOfRange", () => {
  it("يرجع جزءاً واحداً لو النطاق داخل جزء واحد", () => {
    expect(juzesOfRange(1, 10)).toEqual([1]);
  });

  it("يرجع كل الأجزاء المتقاطعة مع النطاق بالترتيب", () => {
    expect(juzesOfRange(15, 45)).toEqual([1, 2, 3]);
  });
});

describe("juzLabel", () => {
  it("يعرض شرطة لقائمة فارغة", () => {
    expect(juzLabel([])).toBe("—");
  });

  it("يعرض جزءاً مفرداً بصيغة مختلفة عن نطاق الأجزاء", () => {
    expect(juzLabel([5])).toBe("جزء 5");
    expect(juzLabel([1, 2, 3])).toBe("أجزاء 1–3");
  });
});

describe("juzToPages", () => {
  it("يحوّل نطاق أجزاء لنطاق صفحات صحيح الحدود", () => {
    const { from, to } = juzToPages(1, 1);
    expect(from).toBe(1);
    expect(to).toBe(21); // آخر صفحة بالجزء الأول قبل بداية الثاني (٢٢)
  });

  it("يقبل الترتيب المعكوس (من جزء أكبر إلى أصغر) بنفس النتيجة", () => {
    const forward = juzToPages(5, 10);
    const backward = juzToPages(10, 5);
    expect(backward).toEqual(forward);
  });

  it("يثبّت الحدود خارج ١..٣٠ بدل قيمة غير صحيحة", () => {
    const { from, to } = juzToPages(0, 999);
    expect(from).toBe(1);
    expect(to).toBe(TOTAL_PAGES);
  });
});
