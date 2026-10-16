import { describe, expect, it } from "vitest";
import { hijriMonthRange, hijriParts, isPeriodChoice, periodLabel, resolvePeriod } from "@/lib/mosque/report-periods";

/*
  حساب فترات التقارير: أسابيع بدايتها السبت (مثل التقييم)، والشهر الهجري
  بتقويم أم القرى — القيم المرجعية محسوبة من Intl نفسه (المصدر المعتمد).
*/

const date = (value: string) => new Date(`${value}T00:00:00Z`);
const MONDAY = date("2026-10-12"); // اثنين 12 أكتوبر 2026

describe("أسابيع السبت", () => {
  it("هذا الأسبوع: يبدأ السبت وينتهي الجمعة ويحتوي اليوم", () => {
    const period = resolvePeriod("this_week", {}, MONDAY)!;
    expect(period).toEqual({ from: "2026-10-10", to: "2026-10-16" });
    expect(date(period.from).getUTCDay()).toBe(6);
    expect(period.from <= "2026-10-12" && "2026-10-12" <= period.to).toBe(true);
  });

  it("الأسبوع الماضي: الأيام السبعة التي قبل بداية هذا الأسبوع", () => {
    const period = resolvePeriod("last_week", {}, MONDAY)!;
    expect(period).toEqual({ from: "2026-10-03", to: "2026-10-09" });
    expect(date(period.from).getUTCDay()).toBe(6);
    expect(period.to < "2026-10-10").toBe(true);
  });

  it("نفس اليوم سبتاً: الأسبوع يبدأ منه نفسه", () => {
    expect(resolvePeriod("this_week", {}, date("2026-10-10"))).toEqual({ from: "2026-10-10", to: "2026-10-16" });
  });
});

describe("الشهر الهجري (أم القرى)", () => {
  it("أجزاء هجرية صحيحة لتواريخ مرجعية", () => {
    expect(hijriParts(date("2026-06-16"))).toEqual({ year: 1448, month: 1, day: 1 }); // 1 محرم 1448
    expect(hijriParts(date("2026-10-12"))).toEqual({ year: 1448, month: 5, day: 1 }); // 1 جمادى الأولى
  });

  it("نطاق الشهر الذي فيه اليوم: أوله وآخره ميلادياً", () => {
    // يوم الاثنين 2026-10-12 هو أول جمادى الأولى 1448، والشهر 30 يوماً
    expect(hijriMonthRange(MONDAY)).toEqual({ from: "2026-10-12", to: "2026-11-10" });
    // تاريخ وسط شهر ربيع الآخر: 2026-09-20
    expect(hijriMonthRange(date("2026-09-20"))).toEqual({ from: "2026-09-12", to: "2026-10-11" });
  });

  it("بنية النطاق سليمة لأي تاريخ: يبدأ بيوم هجري 1 وطوله 29 أو 30", () => {
    for (const day of ["2026-01-01", "2026-10-12", "2027-03-15", "2028-12-31"]) {
      const today = date(day);
      const range = hijriMonthRange(today);
      const start = hijriParts(date(range.from));
      const afterEnd = hijriParts(new Date(date(range.to).getTime() + 86_400_000));
      // بداية الشهر نفسه الذي فيه اليوم، وبعدها بيوم يبدأ شهر جديد
      expect(start.day).toBe(1);
      expect(`${start.year}-${start.month}`).toBe(`${hijriParts(today).year}-${hijriParts(today).month}`);
      expect(`${afterEnd.year}-${afterEnd.month}`).not.toBe(`${start.year}-${start.month}`);
      expect(range.from <= day && day <= range.to).toBe(true);
      const length = (date(range.to).getTime() - date(range.from).getTime()) / 86_400_000 + 1;
      expect(length === 29 || length === 30).toBe(true);
    }
  });
});

describe("النطاق المخصص والاختيار", () => {
  it("اختيار غير معروف = false", () => {
    expect(isPeriodChoice("this_week")).toBe(true);
    expect(isPeriodChoice("year")).toBe(false);
    expect(isPeriodChoice(undefined)).toBe(false);
  });

  it("custom: ناقص أو معكوس = null، وسليم يمر كما هو", () => {
    expect(resolvePeriod("custom", { from: "2026-10-01" }, MONDAY)).toBeNull();
    expect(resolvePeriod("custom", { to: "2026-10-01" }, MONDAY)).toBeNull();
    expect(resolvePeriod("custom", { from: "2026-10-05", to: "2026-10-01" }, MONDAY)).toBeNull();
    expect(resolvePeriod("custom", { from: "2026-02-30", to: "2026-03-01" }, MONDAY)).toBeNull();
    expect(resolvePeriod("custom", { from: "2026-10-01", to: "2026-10-31" }, MONDAY)).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
    });
  });

  it("عنوان الفترة بالميلادي", () => {
    expect(periodLabel({ from: "2026-10-10", to: "2026-10-16" })).toContain("أكتوبر");
  });
});
