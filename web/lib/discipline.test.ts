import { describe, expect, it } from "vitest";
import {
  DEFAULT_DISCIPLINE_CONFIG,
  absenceLadderActions,
  absenceStats,
  docKindsForEvent,
  mergeDisciplineConfig,
  parseDisciplineConfigBody,
  sheetToCsv,
  summarizeMonthAttendance,
  violationStepForCount,
  type AbsenceDay,
} from "./discipline";

/*
  A2 — اختبار منطق الانضباط النقي: عتبات سُلّم الغياب (المتتالي مقابل
  غير المتتالي)، سُلّم المخالفات، دمج الإعدادات، وملخّصات الحضور.
*/

const CONFIG = DEFAULT_DISCIPLINE_CONFIG;
const TODAY = "2026-10-15";

function days(pairs: [string, AbsenceDay["status"]][]): AbsenceDay[] {
  return pairs.map(([date, status]) => ({ date, status }));
}

function kinds(actions: ReturnType<typeof absenceLadderActions>): string[] {
  return actions.map((a) => a.kind);
}

describe("سُلّم الغياب — العتبات", () => {
  it("٣ أيام غياب متتالية = إنذار أول فقط، مع إشعار ولي الأمر", () => {
    const stats = absenceStats(
      days([
        ["2026-10-13", "absent"],
        ["2026-10-14", "absent"],
        ["2026-10-15", "absent"],
      ]),
      TODAY,
      CONFIG.absence,
    );
    expect(stats).toEqual({ currentStreak: 3, termAbsences: 3 });
    const actions = absenceLadderActions(stats, CONFIG.absence);
    expect(kinds(actions)).toEqual(["absence_warning"]);
    expect(actions[0].level).toBe(1);
    expect(actions[0].notifyParent).toBe(true);
  });

  it("٧ أيام متتالية = استدعاء ولي الأمر (لا إنذار أول مكرراً) + تنبيه الإدارة", () => {
    const stats = absenceStats(
      days(
        Array.from({ length: 7 }, (_, i) => [`2026-10-${String(9 + i).padStart(2, "0")}`, "absent"] as [string, AbsenceDay["status"]]),
      ),
      TODAY,
      CONFIG.absence,
    );
    expect(stats.currentStreak).toBe(7);
    const actions = absenceLadderActions(stats, CONFIG.absence);
    expect(kinds(actions)).toEqual(["parent_summons", "admin_alert"]);
    expect(actions[0].notifyParent).toBe(true);
    expect(actions[1].notifyParent).toBe(false);
  });

  it("١٠ غيابات غير متتالية خلال الفصل = إنذار ثانٍ بلا إنذار أول", () => {
    // يومان متتاليان فقط في النهاية — لا يبلغان حدّ الأول (٣)
    const spread: [string, AbsenceDay["status"]][] = Array.from(
      { length: 10 },
      (_, i) => [`2026-09-${String(1 + i * 2).padStart(2, "0")}`, "absent" as const],
    );
    spread.push(["2026-10-14", "absent"], ["2026-10-15", "absent"]);
    const stats = absenceStats(days(spread), TODAY, CONFIG.absence);
    expect(stats).toEqual({ currentStreak: 2, termAbsences: 12 });
    const actions = absenceLadderActions(stats, CONFIG.absence);
    expect(kinds(actions)).toEqual(["absence_warning"]);
    expect(actions[0].level).toBe(2);
    expect(actions[0].notifyParent).toBe(false);
  });

  it("حضور واحد يقطع التتابع — السلسلة تبدأ من أحدث يوم فقط", () => {
    const stats = absenceStats(
      days([
        ["2026-10-08", "absent"],
        ["2026-10-09", "absent"],
        ["2026-10-10", "present"],
        ["2026-10-14", "absent"],
        ["2026-10-15", "absent"],
      ]),
      TODAY,
      CONFIG.absence,
    );
    expect(stats.currentStreak).toBe(2);
    expect(stats.termAbsences).toBe(4);
  });

  it("فجوة تقويمية أطول من الحدّ تقطع التتابع (حلقة تجتمع أياماً متباعدة)", () => {
    const stats = absenceStats(
      days([
        ["2026-10-01", "absent"],
        ["2026-10-02", "absent"],
        ["2026-10-14", "absent"], // فجوة ١٢ يوماً > ٧
        ["2026-10-15", "absent"],
      ]),
      TODAY,
      CONFIG.absence,
    );
    expect(stats.currentStreak).toBe(2);
    expect(stats.termAbsences).toBe(4);
  });

  it("غيابات أقدم من نافذة الفصل لا تدخل عدّاد الفصل", () => {
    const stats = absenceStats(
      days([
        ["2026-06-01", "absent"], // خارج نافذة ١٢٠ يوماً
        ["2026-10-15", "absent"],
      ]),
      TODAY,
      CONFIG.absence,
    );
    expect(stats.termAbsences).toBe(1);
  });

  it("المستأذن والمتأخر لا يُعدّان غياباً في السلسلة", () => {
    const stats = absenceStats(
      days([
        ["2026-10-13", "excused"],
        ["2026-10-14", "absent"],
        ["2026-10-15", "late"],
      ]),
      TODAY,
      CONFIG.absence,
    );
    expect(stats.currentStreak).toBe(0);
  });

  it("غياب مستقبلي (خطأ تاريخ) يُهمل كلياً", () => {
    const stats = absenceStats(
      days([
        ["2026-10-15", "absent"],
        ["2026-10-16", "absent"],
      ]),
      TODAY,
      CONFIG.absence,
    );
    expect(stats.currentStreak).toBe(1);
  });

  it("العتبات قابلة للضبط: رفع حدّ الإنذار الأول إلى ٥", () => {
    const config = { ...CONFIG.absence, warn1ConsecutiveDays: 5 };
    const stats = absenceStats(
      days([
        ["2026-10-13", "absent"],
        ["2026-10-14", "absent"],
        ["2026-10-15", "absent"],
      ]),
      TODAY,
      config,
    );
    expect(absenceLadderActions(stats, config)).toEqual([]);
  });
});

describe("سُلّم المخالفات", () => {
  it("كل مخالفة درجة: ١=مناصحة … ٥=إيقاف، ٦=رفع للجنة، وما بعدها يبقى ٦", () => {
    const steps = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => violationStepForCount(n, CONFIG.violations));
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 6, 6]);
  });

  it("escalateEvery = 2: كل مخالفتين درجة", () => {
    const config = { ...CONFIG.violations, escalateEvery: 2 };
    expect(violationStepForCount(1, config)).toBe(1);
    expect(violationStepForCount(2, config)).toBe(1);
    expect(violationStepForCount(3, config)).toBe(2);
    expect(violationStepForCount(9, config)).toBe(5);
  });
});

describe("الإعدادات", () => {
  it("الدمج فوق الافتراضي: القيم الغائبة تبقى افتراضية والموجودة تُستبدل", () => {
    const merged = mergeDisciplineConfig({ absence: { warn1ConsecutiveDays: 5 } });
    expect(merged.absence.warn1ConsecutiveDays).toBe(5);
    expect(merged.absence.warn2TermAbsences).toBe(CONFIG.absence.warn2TermAbsences);
    expect(merged.violations.categories).toEqual(CONFIG.violations.categories);
  });

  it("قيم تالفة تسقط على الافتراضي (لا تُفشل الميزة)", () => {
    const merged = mergeDisciplineConfig({ absence: { termDays: "أسبوع" }, violations: { categories: "نص" } });
    expect(merged.absence.termDays).toBe(CONFIG.absence.termDays);
    expect(merged.violations.categories).toEqual(CONFIG.violations.categories);
    expect(mergeDisciplineConfig(null)).toEqual(CONFIG);
    expect(mergeDisciplineConfig("x")).toEqual(CONFIG);
  });

  it("parseDisciplineConfigBody يقبل الجسم الصحيح ويرفض الخاطئ", () => {
    expect(parseDisciplineConfigBody({ absence: { termDays: 90 } }).ok).toBe(true);
    expect(parseDisciplineConfigBody({ absence: { termDays: 2 } }).ok).toBe(false); // دون الحدّ الأدنى
    expect(parseDisciplineConfigBody("not-config").ok).toBe(false);
    expect(parseDisciplineConfigBody({ violations: { categories: [] } }).ok).toBe(false);
    expect(parseDisciplineConfigBody({ violations: { categories: ["أ", "أ"] } }).ok).toBe(false); // تكرار
    expect(parseDisciplineConfigBody({ absence: { defaultPresent: "نعم" } }).ok).toBe(false);
  });
});

describe("مستندات الأحداث", () => {
  it("خريطة المستندات: الإنذار/المخالفة الموقعة←إنذار، التعهد، الاستدعاء", () => {
    expect(docKindsForEvent("absence_warning", 1)).toEqual(["warning"]);
    expect(docKindsForEvent("violation", 2)).toEqual(["warning"]);
    expect(docKindsForEvent("violation", 3)).toEqual(["pledge"]);
    expect(docKindsForEvent("violation", 4)).toEqual(["summons"]);
    expect(docKindsForEvent("parent_summons", 1)).toEqual(["summons", "pledge"]);
    expect(docKindsForEvent("violation", 1)).toEqual([]); // مناصحة بلا مستند
    expect(docKindsForEvent("admin_alert", 1)).toEqual([]);
    expect(docKindsForEvent("dismissal", 1)).toEqual([]);
  });
});

describe("ملخّص حضور الشهر", () => {
  const stored = [
    { studentId: "a", date: "2026-10-01", status: "present" as const },
    { studentId: "a", date: "2026-10-02", status: "absent" as const },
    { studentId: "b", date: "2026-10-01", status: "late" as const },
  ];

  it("بدون «حاضر افتراضياً»: يوم اجتماع بلا قرار = غير مسجَّل", () => {
    const counts = summarizeMonthAttendance(["a", "b"], stored, false);
    expect(counts.a).toEqual({ present: 1, late: 0, excused: 0, absent: 1, unmarked: 0 });
    expect(counts.b).toEqual({ present: 0, late: 1, excused: 0, absent: 0, unmarked: 1 });
  });

  it("بنمط «حاضر افتراضياً»: يوم اجتماع بلا قرار يُعدّ حضوراً", () => {
    const counts = summarizeMonthAttendance(["a", "b"], stored, true);
    expect(counts.b.present).toBe(1);
    expect(counts.b.unmarked).toBe(0);
  });

  it("طالب بلا صفوف إطلاقاً: كل أيام الاجتماع غير مسجَّلة (أو حضور بالنمط)", () => {
    expect(summarizeMonthAttendance(["c"], stored, false).c.unmarked).toBe(2);
    expect(summarizeMonthAttendance(["c"], stored, true).c.present).toBe(2);
  });
});

describe("CSV", () => {
  it("يهرب الفواصل وعلامات الاقتباس ويسطر برأس واحد", () => {
    const csv = sheetToCsv(["الاسم", "الحضور"], [["أحمد، الصغير", 'قول "نعم"'], [3, 4]]);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain('"أحمد، الصغير"');
    expect(csv).toContain('"قول ""نعم"""');
  });
});
