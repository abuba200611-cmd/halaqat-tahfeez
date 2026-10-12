import { describe, expect, it } from "vitest";
import { formatWeek, isSaturday, parseWeekStart, recentWeeks, saturdayOf, summarizeWeek } from "@/lib/evaluation";

describe("أسابيع التقييم (تبدأ السبت)", () => {
  it("أقرب سبت ≤ التاريخ لكل أيام الأسبوع", () => {
    // 2026-10-10 سبت
    for (const [day, expected] of [
      [10, "2026-10-10"],
      [11, "2026-10-10"],
      [14, "2026-10-10"],
      [16, "2026-10-10"],
      [17, "2026-10-17"],
    ] as const) {
      expect(formatWeek(saturdayOf(new Date(2026, 9, day)))).toBe(expected);
    }
  });

  it("parseWeekStart يرفض التواريخ المستحيلة والصيغ الخاطئة", () => {
    expect(parseWeekStart("2026-10-10")).not.toBeNull();
    expect(parseWeekStart("2026-02-30")).toBeNull();
    expect(parseWeekStart("10-10-2026")).toBeNull();
    expect(isSaturday(parseWeekStart("2026-10-10")!)).toBe(true);
    expect(isSaturday(parseWeekStart("2026-10-11")!)).toBe(false);
  });

  it("recentWeeks: الأحدث أولاً وكلها أسبوعها سبت بفارق 7 أيام", () => {
    const weeks = recentWeeks(3, new Date(2026, 9, 14));
    expect(weeks).toEqual(["2026-10-10", "2026-10-03", "2026-09-26"]);
    expect(weeks.every((w) => isSaturday(parseWeekStart(w)!))).toBe(true);
  });
});

describe("summarizeWeek", () => {
  const criteria = [
    { id: 1, name: "أ", maxScore: 10 },
    { id: 2, name: "ب", maxScore: 10 },
  ];
  const targets = [
    { id: 1, name: "النور" },
    { id: 2, name: "الهدى" },
    { id: 3, name: "الفجر" },
  ];

  it("مجموع وترتيب تنافسي (المتساوون بالمجموع بنفس الترتيب)", () => {
    const rows = summarizeWeek(criteria, targets, [
      { targetId: 1, criterionId: 1, score: 5 },
      { targetId: 1, criterionId: 2, score: 5 },
      { targetId: 2, criterionId: 1, score: 10 },
      { targetId: 3, criterionId: 1, score: 3 },
    ]);
    expect(rows.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(rows.map((r) => r.total)).toEqual([10, 10, 3]);
    expect(rows[2].name).toBe("الفجر");
  });

  it("يتجاهل معياراً غير موجود وهدفاً غير موجود، والأهداف بلا درجات لا تظهر", () => {
    const rows = summarizeWeek(criteria, targets, [
      { targetId: 1, criterionId: 99, score: 7 },
      { targetId: 99, criterionId: 1, score: 7 },
    ]);
    expect(rows).toEqual([]);
  });
});
