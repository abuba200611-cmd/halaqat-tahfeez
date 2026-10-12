import { describe, expect, it } from "vitest";
import {
  elapsedFraction,
  hijriMonthOfISO,
  hijriMonthRange,
  isValidMonthKey,
  monthLabel,
  shiftMonthKey,
} from "./hijri";

describe("hijriMonthOfISO — شهر أم القرى (STEP 63)", () => {
  it("يوم معروف: أول محرّم 1448 = 2026-06-16", () => {
    expect(hijriMonthOfISO("2026-06-16")).toBe("1448-01");
  });

  it("حدّ الشهر: اليوم السابق لأول محرّم هو ذو الحجة 1447", () => {
    expect(hijriMonthOfISO("2026-06-15")).toBe("1447-12");
  });

  it("منتصف السنة", () => {
    expect(hijriMonthOfISO("2026-10-12")).toBe("1448-05");
  });

  it("تاريخ غير صالح يرمي خطأ", () => {
    expect(() => hijriMonthOfISO("2026-02-31")).toThrow();
  });
});

describe("hijriMonthRange — النطاق الميلادي للشهر", () => {
  it("1448-01 يبدأ 2026-06-16 وطوله 29 أو 30 يوماً", () => {
    const r = hijriMonthRange("1448-01");
    expect(r.start).toBe("2026-06-16");
    expect([29, 30]).toContain(r.days);
  });

  it("الشهور متتالية بلا فجوة ولا تداخل", () => {
    let key = "1447-10";
    for (let i = 0; i < 26; i++) {
      const next = shiftMonthKey(key, 1)!;
      const a = hijriMonthRange(key);
      const b = hijriMonthRange(next);
      expect(Date.parse(b.start) - Date.parse(a.end)).toBe(86400000);
      expect(hijriMonthOfISO(a.start)).toBe(key);
      expect(hijriMonthOfISO(a.end)).toBe(key);
      key = next;
    }
  });

  it("مفتاح غير صالح يرمي خطأ", () => {
    expect(() => hijriMonthRange("1448-13")).toThrow();
  });
});

describe("shiftMonthKey / isValidMonthKey / monthLabel", () => {
  it("يعبر حدّ السنة", () => {
    expect(shiftMonthKey("1448-01", -1)).toBe("1447-12");
    expect(shiftMonthKey("1447-12", 1)).toBe("1448-01");
  });

  it("يرفض الصيغ الخاطئة والمدى غير المدعوم", () => {
    expect(isValidMonthKey("1448-04")).toBe(true);
    expect(isValidMonthKey("1448-00")).toBe(false);
    expect(isValidMonthKey("1448-13")).toBe(false);
    expect(isValidMonthKey("2026-10")).toBe(false);
    expect(isValidMonthKey("abc")).toBe(false);
    expect(isValidMonthKey(null)).toBe(false);
  });

  it("اسم الشهر بالعربية", () => {
    expect(monthLabel("1448-04")).toContain("ربيع الآخر");
  });
});

describe("elapsedFraction", () => {
  const range = { start: "2026-10-01", end: "2026-10-30", days: 30 };
  it("قبل البداية ٠، آخر يوم ١، بعد النهاية ١", () => {
    expect(elapsedFraction(range, "2026-09-30")).toBe(0);
    expect(elapsedFraction(range, "2026-10-30")).toBe(1);
    expect(elapsedFraction(range, "2026-11-05")).toBe(1);
  });
  it("اليوم الأول يُحسب يوماً منقضياً", () => {
    expect(elapsedFraction(range, "2026-10-01")).toBeCloseTo(1 / 30);
    expect(elapsedFraction(range, "2026-10-15")).toBeCloseTo(0.5);
  });
});
