import { describe, expect, it } from "vitest";
import {
  countAttendance,
  isAttendanceStatus,
  isValidAttendanceDate,
  mergeDayAttendance,
  summarizeAttendance,
} from "./attendance";

describe("التحقق من المدخلات (STEP 62)", () => {
  it("الحالات: الأربع فقط", () => {
    for (const s of ["present", "late", "excused", "absent"]) expect(isAttendanceStatus(s)).toBe(true);
    for (const s of ["", "PRESENT", "sick", null, 1, undefined]) expect(isAttendanceStatus(s)).toBe(false);
  });

  it("التاريخ: صيغة وتقويم صحيحان فقط", () => {
    expect(isValidAttendanceDate("2026-10-20")).toBe(true);
    for (const d of ["2026-2-3", "20261020", "2026-02-31", "2026-13-01", "", null, 5, "2026-10-20x"]) {
      expect(isValidAttendanceDate(d)).toBe(false);
    }
  });
});

describe("mergeDayAttendance — الحضور الضمني من الورد (STEP 62)", () => {
  const students = [
    { id: "a", name: "أحمد" },
    { id: "b", name: "بدر" },
    { id: "c", name: "جاسم" },
  ];

  it("طالب أرسل ورداً بلا صفّ مخزَّن: حاضر ضمنياً", () => {
    const rows = mergeDayAttendance(students, [], ["a"]);
    expect(rows[0]).toMatchObject({ studentId: "a", status: "present", implicit: true });
    expect(rows[1]).toMatchObject({ studentId: "b", status: null, implicit: false });
  });

  it("الصفّ المخزَّن يغلب الضمني (غائب رغم وجود ورد) ويحمل ملاحظته", () => {
    const rows = mergeDayAttendance(students, [{ studentId: "a", status: "absent", note: "مريض" }], ["a"]);
    expect(rows[0]).toMatchObject({ status: "absent", implicit: false, note: "مريض" });
  });

  it("العدّادات تحسب غير المحدَّد", () => {
    const rows = mergeDayAttendance(students, [{ studentId: "b", status: "late", note: null }], ["a"]);
    expect(countAttendance(rows)).toEqual({ present: 1, late: 1, excused: 0, absent: 0, unmarked: 1 });
  });
});

describe("summarizeAttendance — آخر ٣٠ يوماً", () => {
  const today = "2026-10-30";

  it("بلا بيانات: null ولا قسمة على صفر", () => {
    expect(summarizeAttendance([], [], today)).toMatchObject({ days: 0, presentPct: null });
  });

  it("يحسب النسبة (حاضر+متأخر) والغياب، والورد يُحسب حضوراً ضمنياً، والصفّ المخزَّن يغلب", () => {
    const s = summarizeAttendance(
      [
        { date: "2026-10-29", status: "absent" },
        { date: "2026-10-28", status: "late" },
        { date: "2026-10-27", status: "excused" },
      ],
      ["2026-10-29", "2026-10-26"],
      today,
    );
    expect(s).toMatchObject({ days: 4, present: 1, late: 1, excused: 1, absent: 1, presentPct: 50 });
  });

  it("يتجاهل ما خارج النافذة والمستقبل", () => {
    const s = summarizeAttendance(
      [
        { date: "2026-09-30", status: "absent" }, // قبل ٣٠ يوماً
        { date: "2026-10-31", status: "absent" }, // مستقبل
        { date: "2026-10-01", status: "present" }, // أول يوم بالنافذة
      ],
      [],
      today,
    );
    expect(s).toMatchObject({ days: 1, present: 1, absent: 0, presentPct: 100 });
  });
});
