import { describe, expect, it } from "vitest";
import { DEFAULT_PERMITS_CONFIG, academicYearStart, addDaysISO } from "./permits";
import {
  DEFAULT_TEACHER_EVAL_CONFIG,
  EVAL_STATE_LABELS,
  computeEvaluationTotal,
  computeIncentives,
  computeProductivity,
  evalStateCounts,
  isKhatm,
  mergeTeacherEvalConfig,
  parseAbsenceDays,
  parsePeriodKey,
  parseScoresBody,
  parseTeacherEvalConfigBody,
  periodKey,
  periodRange,
  recommendationFor,
  teacherScoreBars,
  type PassedExam,
  type TeacherEvalRow,
} from "./teacher-eval";

const CFG = DEFAULT_TEACHER_EVAL_CONFIG;

function exam(studentId: string, juzFrom: number, juzTo: number, halaqahId = 1): PassedExam {
  return { halaqahId, studentId, studentName: `طالب ${studentId}`, juzFrom, juzTo };
}

describe("الدرجة الكلية", () => {
  it("الافتراضي خمسة معايير مجموع أوزانها ١٠٠", () => {
    expect(CFG.criteria.map((c) => c.label)).toEqual(["الانضباط", "جودة التحفيظ", "المتابعة", "التعامل", "المبادرة"]);
    expect(CFG.criteria.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });

  it("الدرجات كلها ١٠٠ = ١٠٠٪، وكلها صفر = ٠٪", () => {
    const full = Object.fromEntries(CFG.criteria.map((c) => [c.key, 100]));
    const zero = Object.fromEntries(CFG.criteria.map((c) => [c.key, 0]));
    expect(computeEvaluationTotal(CFG.criteria, full).totalPct).toBe(100);
    expect(computeEvaluationTotal(CFG.criteria, zero).totalPct).toBe(0);
  });

  it("المتوسط المرجَّح بالأوزان", () => {
    // 25*80 + 30*70 + 20*60 + 15*90 + 10*50 = 2000+2100+1200+1350+500 = 7150 → 71.5
    const scores = { discipline: 80, memorization_quality: 70, followup: 60, conduct: 90, initiative: 50 };
    expect(computeEvaluationTotal(CFG.criteria, scores)).toEqual({ totalPct: 71.5, scoredCount: 5, complete: true });
  });

  it("أوزان لا تساوي ١٠٠ تُطبَّع بمجموعها", () => {
    const criteria = [
      { key: "a", label: "أ", weight: 1 },
      { key: "b", label: "ب", weight: 3 },
    ];
    expect(computeEvaluationTotal(criteria, { a: 100, b: 0 }).totalPct).toBe(25);
  });

  it("ناقص المعايير = بلا درجة كلية ولا توصية", () => {
    const partial = { discipline: 90, memorization_quality: null };
    const total = computeEvaluationTotal(CFG.criteria, partial);
    expect(total).toMatchObject({ totalPct: null, complete: false, scoredCount: 1 });
    expect(recommendationFor(total.totalPct, CFG.thresholds)).toBeNull();
  });
});

describe("عتبات التوصية", () => {
  it("≥ ٧٠ تجديد، ٦٠–٦٩ تجديد بخطة علاجية، < ٦٠ لا يُوصى", () => {
    expect(recommendationFor(100, CFG.thresholds)).toBe("renew");
    expect(recommendationFor(70, CFG.thresholds)).toBe("renew");
    expect(recommendationFor(69.9, CFG.thresholds)).toBe("renew_remedial");
    expect(recommendationFor(60, CFG.thresholds)).toBe("renew_remedial");
    expect(recommendationFor(59.9, CFG.thresholds)).toBe("not_recommended");
    expect(recommendationFor(0, CFG.thresholds)).toBe("not_recommended");
  });

  it("العتبات قابلة للضبط", () => {
    const thresholds = { renewMin: 80, remedialMin: 50 };
    expect(recommendationFor(75, thresholds)).toBe("renew_remedial");
    expect(recommendationFor(79.9, thresholds)).toBe("renew_remedial");
    expect(recommendationFor(49, thresholds)).toBe("not_recommended");
  });
});

describe("الإنتاجية", () => {
  it("٥ طلاب مجتازين يكفون", () => {
    const exams = ["1", "2", "3", "4", "5"].map((id) => exam(id, 1, 1));
    expect(computeProductivity(exams, CFG.productivity)).toMatchObject({ studentsPassed: 5, meets: true });
  });

  it("٤ طلاب بلا ختم لا يكفون", () => {
    const exams = ["1", "2", "3", "4"].map((id) => exam(id, 1, 5));
    expect(computeProductivity(exams, CFG.productivity)).toMatchObject({ studentsPassed: 4, juzPassed: 20, meets: false });
  });

  it("الطالب المكرر يُعدّ مرة واحدة", () => {
    const exams = [exam("1", 1, 1), exam("1", 2, 2), exam("1", 3, 3), exam("2", 1, 1), exam("3", 1, 1)];
    expect(computeProductivity(exams, CFG.productivity).studentsPassed).toBe(3);
  });

  it("ختم واحد يكفي ولو طالباً واحداً", () => {
    expect(isKhatm(exam("1", 1, 30))).toBe(true);
    expect(isKhatm(exam("1", 1, 29))).toBe(false);
    expect(computeProductivity([exam("1", 1, 30)], CFG.productivity)).toMatchObject({ khatmCount: 1, meets: true });
  });

  it("الحد قابل للضبط", () => {
    const exams = ["1", "2"].map((id) => exam(id, 1, 1));
    expect(computeProductivity(exams, { minStudentsPassed: 2, minKhatm: 1 }).meets).toBe(true);
  });
});

describe("حساب الحوافز", () => {
  const rates = { studentPerJuz: 10, studentPerKhatm: 100, teacherPerJuz: 5, teacherPerKhatm: 150, currency: "ر.س" };

  it("الجزء بسعره: ٥ أجزاء = ٥٠ للطالب و٢٥ للمعلّم", () => {
    const report = computeIncentives([exam("1", 1, 5)], rates);
    expect(report.lines[0]).toMatchObject({ juz: 5, khatm: 0, studentAmount: 50, teacherAmount: 25 });
    expect(report.studentTotal).toBe(50);
    expect(report.teacherTotal).toBe(25);
  });

  it("الختم بسعره وحده (بلا إضافة ٣٠ جزءاً)", () => {
    const report = computeIncentives([exam("1", 1, 30)], rates);
    expect(report.lines[0]).toMatchObject({ juz: 0, khatm: 1, studentAmount: 100, teacherAmount: 150 });
    expect(report.totalJuz).toBe(0);
    expect(report.totalKhatm).toBe(1);
  });

  it("تُجمع أسطر الطالب الواحد وتُجمع الإجماليات", () => {
    const report = computeIncentives([exam("1", 1, 2), exam("1", 3, 3), exam("2", 1, 30)], rates);
    expect(report.lines).toHaveLength(2);
    expect(report.lines.find((l) => l.studentId === "1")).toMatchObject({ juz: 3, studentAmount: 30, teacherAmount: 15 });
    expect(report.studentTotal).toBe(130);
    expect(report.teacherTotal).toBe(165);
  });

  it("لا اختبارات = تقرير فارغ بأصفار", () => {
    expect(computeIncentives([], rates)).toEqual({ lines: [], totalJuz: 0, totalKhatm: 0, studentTotal: 0, teacherTotal: 0 });
  });

  it("مبالغ كسرية تُقرَّب لخانتين بلا أخطاء الفاصلة العائمة", () => {
    const report = computeIncentives([exam("1", 1, 3)], { ...rates, studentPerJuz: 0.1, teacherPerJuz: 0.2 });
    expect(report.studentTotal).toBe(0.3);
    expect(report.teacherTotal).toBe(0.6);
  });
});

describe("الفترات", () => {
  it("مفتاح الفترة ذهاباً وإياباً", () => {
    expect(periodKey(1448, "year")).toBe("1448");
    expect(periodKey(1448, "1")).toBe("1448-T1");
    expect(parsePeriodKey("1448-T2")).toEqual({ year: 1448, term: "2" });
    expect(parsePeriodKey("1448")).toEqual({ year: 1448, term: "year" });
    expect(parsePeriodKey("1448-T3")).toBeNull();
  });

  it("الفصلان يغطيان العام بلا تداخل ولا فجوة", () => {
    const year = periodRange(1448, "year", DEFAULT_PERMITS_CONFIG, CFG);
    const t1 = periodRange(1448, "1", DEFAULT_PERMITS_CONFIG, CFG);
    const t2 = periodRange(1448, "2", DEFAULT_PERMITS_CONFIG, CFG);
    expect(t1.from).toBe(year.from);
    expect(t2.to).toBe(year.to);
    expect(addDaysISO(t1.to, 1)).toBe(t2.from);
    expect(year.from).toBe(academicYearStart(1448, DEFAULT_PERMITS_CONFIG));
    expect(t1.to < t2.from).toBe(true);
  });
});

describe("الإعدادات والمدخلات", () => {
  it("الافتراضيات: عتبتا ٧٠/٦٠ وإنتاجية ٥ أو ١ ختم", () => {
    const c = mergeTeacherEvalConfig(undefined);
    expect(c.thresholds).toEqual({ renewMin: 70, remedialMin: 60 });
    expect(c.productivity).toEqual({ minStudentsPassed: 5, minKhatm: 1 });
  });

  it("معايير تالفة تسقط على الافتراضي، وحد الخطة العلاجية لا يتجاوز حد التجديد", () => {
    expect(mergeTeacherEvalConfig({ criteria: [{ key: "a b", label: "x", weight: 5 }] }).criteria).toEqual(CFG.criteria);
    expect(mergeTeacherEvalConfig({ thresholds: { renewMin: 60, remedialMin: 90 } }).thresholds.remedialMin).toBe(60);
  });

  it("جسم PUT: معيار مكرر أو وزن خارج المدى أو عتبة معطوبة = رفض", () => {
    const dup = [
      { key: "a", label: "أ", weight: 10 },
      { key: "a", label: "ب", weight: 10 },
    ];
    expect(parseTeacherEvalConfigBody({ criteria: dup }).ok).toBe(false);
    expect(parseTeacherEvalConfigBody({ criteria: [{ key: "a", label: "أ", weight: 0 }] }).ok).toBe(false);
    expect(parseTeacherEvalConfigBody({ thresholds: { renewMin: 101 } }).ok).toBe(false);
    expect(parseTeacherEvalConfigBody({ thresholds: { renewMin: 60, remedialMin: 70 } }).ok).toBe(false);
    expect(parseTeacherEvalConfigBody({ incentives: { studentPerJuz: -1 } }).ok).toBe(false);
    expect(parseTeacherEvalConfigBody({}).ok).toBe(false);
    const ok = parseTeacherEvalConfigBody({ incentives: { studentPerJuz: 20 } });
    expect(ok.ok && ok.config.incentives.studentPerJuz).toBe(20);
  });

  it("درجات الجسم: مفتاح غريب أو خارج ٠..١٠٠ أو كسر = رفض، وفارغ = null", () => {
    expect(parseScoresBody({ discipline: 101 }, CFG.criteria).ok).toBe(false);
    expect(parseScoresBody({ discipline: -1 }, CFG.criteria).ok).toBe(false);
    expect(parseScoresBody({ discipline: 80.5 }, CFG.criteria).ok).toBe(false);
    expect(parseScoresBody({ hacker: 50 }, CFG.criteria).ok).toBe(false);
    const ok = parseScoresBody({ discipline: "85", followup: "" }, CFG.criteria);
    expect(ok.ok && ok.scores.discipline).toBe(85);
    expect(ok.ok && ok.scores.followup).toBeNull();
    expect(ok.ok && ok.scores.conduct).toBeNull();
  });

  it("غياب المعلّم: اختياري ورقم صحيح ٠..٣٦٦", () => {
    expect(parseAbsenceDays("")).toBeNull();
    expect(parseAbsenceDays(null)).toBeNull();
    expect(parseAbsenceDays(4)).toBe(4);
    expect(Number.isNaN(parseAbsenceDays(-1))).toBe(true);
    expect(Number.isNaN(parseAbsenceDays(367))).toBe(true);
    expect(Number.isNaN(parseAbsenceDays(1.5))).toBe(true);
  });
});

// ————— رسوم صفحة التقييم (مواصفة 003) —————

function row(
  id: number,
  name: string,
  totalPct: number | null,
  recommendation: NonNullable<TeacherEvalRow["evaluation"]>["recommendation"],
): TeacherEvalRow {
  return { id, name, evaluation: { totalPct, recommendation } };
}

describe("teacherScoreBars (أعمدة درجات المعلّمين)", () => {
  it("المكتمل تقييمه فقط، الأعلى درجة أولاً ثم بالاسم عند التساوي", () => {
    const bars = teacherScoreBars([
      row(1, "أحمد", 72, "renew"),
      row(2, "بدر", null, null),
      row(3, "سعد", 88, "renew"),
      row(4, "وليد", 88, "renew_remedial"),
    ]);
    expect(bars).toEqual([
      { label: "سعد", value: 88 },
      { label: "وليد", value: 88 },
      { label: "أحمد", value: 72 },
    ]);
  });

  it("درجة بلا توصية تظهر أيضاً — الرسم للدرجة لا للتوصية", () => {
    const bars = teacherScoreBars([row(1, "أحمد", 65, null), row(2, "بدر", null, "renew")]);
    expect(bars).toEqual([{ label: "أحمد", value: 65 }]);
  });

  it("لا أحد اكتمل تقييمه = لا أعمدة", () => {
    expect(teacherScoreBars([row(1, "أحمد", null, null), row(2, "بدر", null, null)])).toEqual([]);
    expect(teacherScoreBars([])).toEqual([]);
  });
});

describe("evalStateCounts (دونات حالات التقييم)", () => {
  it("المكتملون بتوصيتهم والباقي «لم يكتمل» — كل الحالات دائماً", () => {
    const counts = evalStateCounts([
      row(1, "أحمد", 90, "renew"),
      row(2, "بدر", 65, "renew_remedial"),
      row(3, "سعد", 40, "not_recommended"),
      row(4, "وليد", null, null),
      row(5, "ياسر", 70, null),
    ]);
    expect(counts).toEqual([
      { key: "renew", count: 1 },
      { key: "renew_remedial", count: 1 },
      { key: "not_recommended", count: 1 },
      { key: "incomplete", count: 2 },
    ]);
    expect(EVAL_STATE_LABELS.incomplete).toBe("لم يكتمل التقييم");
  });

  it("مجموع الحالات = عدد المعلّمين مهما كانت بياناتهم", () => {
    const teachers = [row(1, "أحمد", null, null), row(2, "بدر", 50, "not_recommended")];
    expect(evalStateCounts(teachers).reduce((s, c) => s + c.count, 0)).toBe(teachers.length);
  });
});
