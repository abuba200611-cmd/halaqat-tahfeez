import { describe, expect, it } from "vitest";
import {
  attendanceTotals,
  avgMastery,
  computeStudentStats,
  feeBreakdown,
  masteredCount,
  masteryDistribution,
  topStudents,
} from "./students-stats";
import type { AttendanceSummary } from "./attendance";
import type { FeeStatus } from "./fees";
import type { Student } from "./types";

function student(id: string, mastery: Record<number, number> = {}): Student {
  return { id, name: id, group: "", ranges: [], mastery, active: true, rating: 0 };
}

function summary(presentPct: number | null): AttendanceSummary {
  return { days: presentPct === null ? 0 : 10, present: 0, late: 0, excused: 0, absent: 0, presentPct };
}

describe("avgMastery", () => {
  it("يقرّب متوسط درجات الأجزاء", () => {
    expect(avgMastery(student("a", { 1: 70, 2: 75 }))).toBe(73); // 72.5 → 73
  });

  it("يعيد ٠ لطالب بلا أجزاء محفوظة", () => {
    expect(avgMastery(student("a"))).toBe(0);
  });
});

describe("computeStudentStats", () => {
  it("قائمة فارغة: صفر وثلاثة null", () => {
    expect(computeStudentStats({ students: [], attendance: {}, fees: null })).toEqual({
      total: 0,
      avgAttendance: null,
      avgMastery: null,
      feesOutstanding: null,
    });
  });

  it("متوسط الحضور على من له ملخص فقط، والباقي لا يُعدّ", () => {
    const stats = computeStudentStats({
      students: [student("a"), student("b"), student("c")],
      attendance: { a: summary(80), b: summary(73), c: summary(null) },
      fees: null,
    });
    expect(stats.avgAttendance).toBe(77); // (80+73)/2 = 76.5 → 77
  });

  it("متوسط الحضور null حين لا أحد له ملخص", () => {
    const stats = computeStudentStats({
      students: [student("a")],
      attendance: { a: summary(null) },
      fees: null,
    });
    expect(stats.avgAttendance).toBeNull();
  });

  it("متوسط الإتقان يستبعد من لا أجزاء له ويقرّب المرتين", () => {
    const stats = computeStudentStats({
      students: [student("a", { 1: 70, 2: 75 }), student("b", { 1: 90 }), student("c")],
      attendance: {},
      fees: null,
    });
    // a = 73 (من 72.5)، b = 90 → (73+90)/2 = 81.5 → 82
    expect(stats.avgMastery).toBe(82);
  });

  it("متوسط الإتقان null حين لا أحد له أجزاء", () => {
    const stats = computeStudentStats({
      students: [student("a"), student("b")],
      attendance: {},
      fees: null,
    });
    expect(stats.avgMastery).toBeNull();
  });

  it("الرسوم null (ميزة مطفأة) تبقي feesOutstanding null", () => {
    const stats = computeStudentStats({ students: [student("a")], attendance: {}, fees: null });
    expect(stats.feesOutstanding).toBeNull();
  });

  it("الرسوم: مستحق وجزئي يُعدّان، والمدفوع والمعفى والغائب عن الخريطة لا", () => {
    const fees: Record<string, { status: FeeStatus }> = {
      a: { status: "due" },
      b: { status: "partial" },
      c: { status: "paid" },
      d: { status: "waived" },
    };
    const stats = computeStudentStats({
      students: [student("a"), student("b"), student("c"), student("d"), student("e")],
      attendance: {},
      fees,
    });
    expect(stats.feesOutstanding).toBe(2);
  });
});

describe("masteryDistribution", () => {
  it("يوزّع على الشرائح بحدودها ويستبعد من لا أجزاء له", () => {
    const { total, buckets } = masteryDistribution([
      student("a", { 1: 90 }),
      student("b", { 1: 89 }),
      student("c", { 1: 75 }),
      student("d", { 1: 74 }),
      student("e", { 1: 55 }),
      student("f", { 1: 54 }),
      student("g"),
    ]);
    expect(total).toBe(6);
    expect(buckets.map((b) => b.count)).toEqual([1, 2, 2, 1]);
    expect(buckets.map((b) => b.pct)).toEqual([17, 33, 33, 17]);
  });

  it("قائمة فارغة: كل شيء صفر", () => {
    const { total, buckets } = masteryDistribution([]);
    expect(total).toBe(0);
    expect(buckets.every((b) => b.count === 0 && b.pct === 0)).toBe(true);
  });
});

describe("attendanceTotals", () => {
  it("يجمع الحالات الأربع عبر الطلاب", () => {
    const a: AttendanceSummary = { days: 10, present: 6, late: 1, excused: 1, absent: 2, presentPct: 70 };
    const b: AttendanceSummary = { days: 5, present: 3, late: 0, excused: 1, absent: 1, presentPct: 60 };
    expect(attendanceTotals({ a, b })).toEqual({ present: 9, late: 1, excused: 2, absent: 3 });
  });

  it("خريطة فارغة: أصفار", () => {
    expect(attendanceTotals({})).toEqual({ present: 0, late: 0, excused: 0, absent: 0 });
  });
});

describe("feeBreakdown", () => {
  it("يعدّ كل حالة ويستبعد من لا سجلّ له", () => {
    const fees: Record<string, { status: FeeStatus }> = {
      a: { status: "paid" },
      b: { status: "paid" },
      c: { status: "due" },
      d: { status: "waived" },
    };
    const { total, buckets } = feeBreakdown([student("a"), student("b"), student("c"), student("d"), student("e")], fees);
    expect(total).toBe(4);
    expect(buckets).toEqual([
      { status: "paid", count: 2, pct: 50 },
      { status: "partial", count: 0, pct: 0 },
      { status: "due", count: 1, pct: 25 },
      { status: "waived", count: 1, pct: 25 },
    ]);
  });

  it("بلا سجلات: الإجمالي صفر والنسب صفر", () => {
    const { total, buckets } = feeBreakdown([student("a")], {});
    expect(total).toBe(0);
    expect(buckets.every((b) => b.pct === 0)).toBe(true);
  });
});

describe("topStudents", () => {
  it("يرتّب تنازلياً ويقتصر على n ويستبعد بلا بيانات", () => {
    const list = [student("a", { 1: 60 }), student("b", { 1: 95 }), student("c"), student("d", { 1: 80 })];
    expect(topStudents(list, 2).map((s) => s.id)).toEqual(["b", "d"]);
  });

  it("n صفر أو سالب يعيد قائمة فارغة", () => {
    expect(topStudents([student("a", { 1: 60 })], 0)).toEqual([]);
  });
});

describe("masteredCount", () => {
  it("يعدّ من متوسطه ≥ ٧٥ فقط", () => {
    expect(masteredCount([student("a", { 1: 75 }), student("b", { 1: 74 }), student("c")])).toBe(1);
  });
});
