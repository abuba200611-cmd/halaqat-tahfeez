import { describe, expect, it } from "vitest";
import { avgMastery, computeStudentStats } from "./students-stats";
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
