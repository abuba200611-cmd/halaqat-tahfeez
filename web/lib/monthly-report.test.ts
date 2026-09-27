import { describe, expect, it } from "vitest";
import { buildMonthlySummaries } from "./monthly-report";
import type { WardLog, WardStatus } from "./types";

let nextId = 1;

function ward(overrides: Partial<WardLog>): WardLog {
  return {
    id: nextId++,
    studentId: "s1",
    studentName: "طالب",
    date: "2026-01-01",
    hifz: null,
    review: null,
    hifzAyah: null,
    reviewAyah: null,
    reviewSegments: null,
    reviewPagesTotal: 0,
    note: "",
    status: "new",
    createdAt: "2026-01-01 08:00:00",
    previousAttemptId: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    ...overrides,
  };
}

describe("buildMonthlySummaries (STEP 53)", () => {
  it("يرجع قائمة فارغة لعدم وجود أوراد", () => {
    expect(buildMonthlySummaries([])).toEqual([]);
  });

  it("يجمع صفحات الحفظ والمراجعة لورد قديم بلا مقاطع وورد جديد بمقاطع بنفس الشهر", () => {
    const legacy = ward({
      date: "2026-01-05",
      hifz: { from: 10, to: 12 }, // 3 صفحات
      review: { from: 1, to: 4 }, // نطاق قديم بمقطع واحد (قبل STEP 52)
      reviewPagesTotal: 4,
      status: "approved",
    });
    const modern = ward({
      date: "2026-01-20",
      hifz: { from: 13, to: 13 }, // صفحة واحدة
      reviewSegments: [{ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 }],
      reviewPagesTotal: 3, // الملك كاملة: 562-564
      status: "new",
    });

    const [summary] = buildMonthlySummaries([legacy, modern]);
    expect(summary.key).toBe("2026-01");
    expect(summary.hifzPages).toBe(4); // 3 + 1
    expect(summary.reviewPages).toBe(7); // 4 + 3
    expect(summary.totalPages).toBe(11);
    expect(summary.wardCount).toBe(2);
    expect(summary.approvedCount).toBe(1);
    expect(summary.activeDays).toBe(2);
  });

  it("يفصل بين آخر يوم بشهر وأول يوم بالشهر التالي (حدود الشهر)", () => {
    const lastDayOfJan = ward({ date: "2026-01-31", hifz: { from: 1, to: 1 } });
    const firstDayOfFeb = ward({ date: "2026-02-01", hifz: { from: 2, to: 2 } });

    const summaries = buildMonthlySummaries([lastDayOfJan, firstDayOfFeb]);
    expect(summaries.map((s) => s.key).sort()).toEqual(["2026-01", "2026-02"]);
    expect(summaries.find((s) => s.key === "2026-01")?.hifzPages).toBe(1);
    expect(summaries.find((s) => s.key === "2026-02")?.hifzPages).toBe(1);
  });

  it("الأيام النشطة تعدّ التواريخ الفريدة لا عدد الأوراد (محاولتان بنفس اليوم)", () => {
    const first = ward({ date: "2026-03-10", status: "needs_revision" as WardStatus });
    const retry = ward({ date: "2026-03-10", status: "new", previousAttemptId: first.id });
    const otherDay = ward({ date: "2026-03-11" });

    const [summary] = buildMonthlySummaries([first, retry, otherDay]);
    expect(summary.wardCount).toBe(3);
    expect(summary.activeDays).toBe(2);
  });

  it("يرتّب الأشهر تنازلياً — الأحدث أولاً", () => {
    const jan = ward({ date: "2026-01-15" });
    const march = ward({ date: "2026-03-15" });
    const feb = ward({ date: "2026-02-15" });

    const summaries = buildMonthlySummaries([jan, march, feb]);
    expect(summaries.map((s) => s.key)).toEqual(["2026-03", "2026-02", "2026-01"]);
  });

  it("لا يحسب صفحات حفظ لورد بلا حفظ (مراجعة فقط)", () => {
    const reviewOnly = ward({ date: "2026-04-01", hifz: null, reviewPagesTotal: 5 });
    const [summary] = buildMonthlySummaries([reviewOnly]);
    expect(summary.hifzPages).toBe(0);
    expect(summary.reviewPages).toBe(5);
    expect(summary.totalPages).toBe(5);
  });
});
