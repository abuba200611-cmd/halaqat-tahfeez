import { describe, expect, it } from "vitest";
import { daysBeforeISO } from "./attendance";
import {
  METRICS_RANGE_MAX_DAYS,
  buildHalaqahMetrics,
  parseMetricsRange,
  type HalaqahMetricsInput,
} from "./metrics";

/*
  STEP 66 — اختبار المنطق النقي للمقاييس: تحليل النطاق، وبناء الاستجابة
  من صفوف جاهزة (بلا قاعدة بيانات)، وعقد الخصوصية (مفاتيح الاستجابة
  حرفياً — أسماء وأرقاماً فقط).
*/

const TODAY = "2026-10-12";

describe("parseMetricsRange", () => {
  it("الافتراضي: آخر ٣٠ يوماً تنتهي اليوم شاملة الطرفين", () => {
    expect(parseMetricsRange(null, null, TODAY)).toEqual({ ok: true, from: "2026-09-13", to: TODAY });
  });

  it("حدّ واحد: المفقود يكمّل بافتراض النافذة نفسها", () => {
    expect(parseMetricsRange(null, "2026-09-30", TODAY)).toEqual({ ok: true, from: "2026-09-01", to: "2026-09-30" });
    expect(parseMetricsRange("2026-10-01", null, TODAY)).toEqual({ ok: true, from: "2026-10-01", to: TODAY });
  });

  it("نطاق صريح صحيح يمرّ كما هو (مع تقليم المسافات)", () => {
    expect(parseMetricsRange(" 2026-10-01 ", " 2026-10-05 ", TODAY)).toEqual({
      ok: true,
      from: "2026-10-01",
      to: "2026-10-05",
    });
  });

  it("صيغة غير صحيحة أو تاريخ مستحيل: خطأ", () => {
    expect(parseMetricsRange("2026-1-5", "2026-10-12", TODAY).ok).toBe(false);
    expect(parseMetricsRange("abc", "2026-10-12", TODAY).ok).toBe(false);
    expect(parseMetricsRange("2026-02-31", "2026-03-05", TODAY).ok).toBe(false);
    expect(parseMetricsRange("2026-10-01", "2026-13-01", TODAY).ok).toBe(false);
    expect(parseMetricsRange("2026-10-01", "2026-02-30", TODAY).ok).toBe(false);
  });

  it("من بعد إلى: خطأ", () => {
    expect(parseMetricsRange("2026-10-13", "2026-10-12", TODAY).ok).toBe(false);
  });

  it("١٢٠ يوماً شاملة الطرفين مقبولة، و١٢١ مرفوضة", () => {
    const edge = daysBeforeISO(TODAY, METRICS_RANGE_MAX_DAYS - 1);
    expect(parseMetricsRange(edge, TODAY, TODAY)).toEqual({ ok: true, from: edge, to: TODAY });
    const over = daysBeforeISO(TODAY, METRICS_RANGE_MAX_DAYS);
    expect(parseMetricsRange(over, TODAY, TODAY).ok).toBe(false);
  });
});

describe("buildHalaqahMetrics", () => {
  const input: HalaqahMetricsInput = {
    halaqahName: "حلقة الفرقان",
    teacherName: "أ. خالد",
    today: TODAY,
    range: { from: "2026-10-10", to: TODAY },
    students: [
      { id: "s1", name: "أحمد", plan: { hifzPagesTarget: 5, reviewPagesTarget: 5 } },
      { id: "s2", name: "بدر", plan: null },
      { id: "s3", name: "جاسم", plan: null },
    ],
    wards: [
      { studentId: "s1", date: "2026-10-10", status: "approved", hifz: { from: 600, to: 603 }, reviewPages: 10 },
      { studentId: "s1", date: "2026-10-11", status: "approved", hifz: { from: 602, to: 605 }, reviewPages: 5 },
      // مرفوض: تُحتسب تسليماً وحضوراً لا صفحات
      { studentId: "s1", date: "2026-10-12", status: "needs_revision", hifz: { from: 700, to: 701 }, reviewPages: 3 },
      { studentId: "s1", date: "2026-10-12", status: "new", hifz: null, reviewPages: 4 },
      { studentId: "s2", date: "2026-10-11", status: "seen", hifz: { from: 100, to: 101 }, reviewPages: 0 },
    ],
    // صفّ مخزَّن يغلب الحضور الضمني: غياب يوم ١٢ لأحمد رغم ورده المرفوض
    attendance: [
      { studentId: "s1", date: "2026-10-12", status: "absent" },
      { studentId: "s2", date: "2026-10-11", status: "late" },
    ],
    // إنجاز ٢٥ صفحة ضد مستهدف ١٠ → ahead بنسبة ٢٥٠٪ أياً كان ما انقضى من الشهر
    planActuals: { s1: { hifzPages: 15, reviewPages: 10 } },
    recitations: [
      { studentId: "s1", count: 3, scored: 2, scoreSum: 17 },
      { studentId: "s2", count: 1, scored: 0, scoreSum: 0 },
    ],
  };

  it("حسابات الطالب: حضور ضمني/مخزَّن، صفحات مختلفة، مرفوض مستثنى، تتابع حتى نهاية النطاق", () => {
    const [ahmed, badr, jasim] = buildHalaqahMetrics(input).students;
    expect(ahmed).toEqual({
      id: "s1",
      name: "أحمد",
      wards: 4,
      approved: 2,
      attendanceRate: 67, // (حاضران ضمنيان) ÷ ٣ أيام محسوبة — الغياب المخزَّن غلب ضمني يوم ١٢
      streak: 3,
      hifzPagesInRange: 6, // 600-603 مع 602-605 = ٦٠٠..٦٠٥ مختلفة
      reviewPagesInRange: 19, // ١٠+٥+٤ — صفحات المرفوض خارجها
      plan: { status: "ahead", progressPct: 250 },
      recitations: { count: 3, avgScore: 8.5 },
      engagementScore: 86, // ٠٫٣٥×٠٫٦٧ + ٠٫٣×١ + ٠٫٢×١(مقصوص) + ٠٫١٥×٠٫٨٥
    });
    expect(badr).toEqual({
      id: "s2",
      name: "بدر",
      wards: 1,
      approved: 0,
      attendanceRate: 100, // متأخر مخزَّن غلب حاضراً ضمنياً — وكلاهما حضور
      streak: 1,
      hifzPagesInRange: 2,
      reviewPagesInRange: 0,
      plan: null,
      recitations: { count: 1, avgScore: null },
      engagementScore: 100, // الحضور والانتظام كاملان، والباقي مفقود فأُعيد توزيع وزنه
    });
    expect(jasim).toEqual({
      id: "s3",
      name: "جاسم",
      wards: 0,
      approved: 0,
      attendanceRate: null,
      streak: 0,
      hifzPagesInRange: 0,
      reviewPagesInRange: 0,
      plan: null,
      recitations: { count: 0, avgScore: null },
      engagementScore: 0,
    });
  });

  it("الإجماليات مجمَّعة على مستوى الحلقة لا متوسط نسب الطلاب", () => {
    expect(buildHalaqahMetrics(input).totals).toEqual({
      wardsSubmitted: 5,
      wardsApproved: 2,
      attendanceRate: 75, // ٣ حضور من ٤ أيام محسوبة إجمالاً
      planOnTrackRatio: 1, // طالب واحد بخطة وهو متقدّم
      recitations: { count: 4, avgScore: 8.5 },
      hifzPagesInRange: 8,
    });
    expect(buildHalaqahMetrics(input).halaqah).toEqual({
      name: "حلقة الفرقان",
      teacherName: "أ. خالد",
      activeStudents: 3,
    });
  });

  it("خصوصية: مفاتيح الاستجابة أسماء وأرقام فقط — لا ملاحظات ولا حسابات", () => {
    const result = buildHalaqahMetrics(input);
    expect(Object.keys(result.halaqah).sort()).toEqual(["activeStudents", "name", "teacherName"]);
    expect(Object.keys(result.totals).sort()).toEqual([
      "attendanceRate",
      "hifzPagesInRange",
      "planOnTrackRatio",
      "recitations",
      "wardsApproved",
      "wardsSubmitted",
    ]);
    for (const s of result.students) {
      expect(Object.keys(s).sort()).toEqual([
        "approved",
        "attendanceRate",
        "engagementScore",
        "hifzPagesInRange",
        "id",
        "name",
        "plan",
        "recitations",
        "reviewPagesInRange",
        "streak",
        "wards",
      ]);
      expect(Object.keys(s.recitations).sort()).toEqual(["avgScore", "count"]);
      if (s.plan) expect(Object.keys(s.plan).sort()).toEqual(["progressPct", "status"]);
    }
    // حزام ثانٍ: النص الكامل لا يحوي أسماء الحقول الخاصة إطلاقاً
    expect(JSON.stringify(result)).not.toMatch(/note|username|password|phone|parent|case_study|teacherNote/i);
  });
});
