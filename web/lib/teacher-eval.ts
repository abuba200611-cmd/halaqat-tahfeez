/*
  A3 — تقييم المعلّم والحوافز: منطق نقي (بلا قاعدة بيانات). المعايير
  وأوزانها وعتبات التوصية ومعيار الإنتاجية ومبالغ الحوافز كلها قابلة للضبط
  لكل جامع من مفتاح "teacher_eval" في mosque_settings، وهذه الافتراضيات
  تسري عند غيابه. الحوافز عرض فقط — لا تُنفَّذ مدفوعات هنا.
*/
import { formatMonthKey, hijriMonthRange } from "./hijri";
import { academicYearEnd, academicYearStart, addDaysISO, type PermitsConfig } from "./permits";

export const TEACHER_EVAL_FEATURE_KEY = "teacher_eval";
export const EVAL_NOTES_MAX = 1000;
export const EVAL_CRITERIA_MAX = 12;

export type EvalCriterion = { key: string; label: string; weight: number };

export type EvalThresholds = {
  /** من هذه النسبة فأكثر: تجديد */
  renewMin: number;
  /** من هذه النسبة حتى دون renewMin: تجديد بخطة علاجية؛ ودونها: لا يُوصى */
  remedialMin: number;
};

export type ProductivityRule = {
  /** عدد الطلاب المجتازين لاختبارات الأجزاء خلال الفترة */
  minStudentsPassed: number;
  /** أو عدد حالات الختم */
  minKhatm: number;
};

export type IncentiveRates = {
  studentPerJuz: number;
  studentPerKhatm: number;
  teacherPerJuz: number;
  teacherPerKhatm: number;
  currency: string;
};

export type TeacherEvalConfig = {
  criteria: EvalCriterion[];
  thresholds: EvalThresholds;
  productivity: ProductivityRule;
  incentives: IncentiveRates;
  /** عدد الأشهر الهجرية من بداية العام حتى انتهاء الفصل الأول */
  termSplitMonths: number;
};

export const DEFAULT_TEACHER_EVAL_CONFIG: TeacherEvalConfig = {
  criteria: [
    { key: "discipline", label: "الانضباط", weight: 25 },
    { key: "memorization_quality", label: "جودة التحفيظ", weight: 30 },
    { key: "followup", label: "المتابعة", weight: 20 },
    { key: "conduct", label: "التعامل", weight: 15 },
    { key: "initiative", label: "المبادرة", weight: 10 },
  ],
  thresholds: { renewMin: 70, remedialMin: 60 },
  productivity: { minStudentsPassed: 5, minKhatm: 1 },
  incentives: { studentPerJuz: 10, studentPerKhatm: 100, teacherPerJuz: 5, teacherPerKhatm: 100, currency: "ر.س" },
  termSplitMonths: 6,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof num === "number" && Number.isInteger(num) && num >= min && num <= max ? num : fallback;
}

function clampMoney(value: unknown, fallback: number): number {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) && num >= 0 && num <= 1_000_000
    ? Math.round(num * 100) / 100
    : fallback;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeCriteria(value: unknown): EvalCriterion[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const out: EvalCriterion[] = [];
  for (const item of value) {
    const row = asObject(item);
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 60) : "";
    const key = typeof row.key === "string" ? row.key.trim().slice(0, 40) : "";
    const weight = clampInt(row.weight, 1, 100, 0);
    if (label === "" || key === "" || weight === 0 || seen.has(key) || !/^[A-Za-z0-9_-]+$/.test(key)) return null;
    seen.add(key);
    out.push({ key, label, weight });
  }
  return out.length > 0 && out.length <= EVAL_CRITERIA_MAX ? out : null;
}

/** يدمج المخزون (JSON جزئي أو تالف) فوق الافتراضي مع تقييد كل قيمة بحدودها */
export function mergeTeacherEvalConfig(stored: unknown): TeacherEvalConfig {
  const d = DEFAULT_TEACHER_EVAL_CONFIG;
  const source = asObject(stored);
  const thresholds = asObject(source.thresholds);
  const productivity = asObject(source.productivity);
  const incentives = asObject(source.incentives);

  const renewMin = clampInt(thresholds.renewMin, 1, 100, d.thresholds.renewMin);
  let remedialMin = clampInt(thresholds.remedialMin, 0, 100, d.thresholds.remedialMin);
  if (remedialMin > renewMin) remedialMin = renewMin;

  const currency =
    typeof incentives.currency === "string" && incentives.currency.trim() !== ""
      ? incentives.currency.trim().slice(0, 12)
      : d.incentives.currency;

  return {
    criteria: normalizeCriteria(source.criteria) ?? d.criteria.map((c) => ({ ...c })),
    thresholds: { renewMin, remedialMin },
    productivity: {
      minStudentsPassed: clampInt(productivity.minStudentsPassed, 1, 500, d.productivity.minStudentsPassed),
      minKhatm: clampInt(productivity.minKhatm, 1, 50, d.productivity.minKhatm),
    },
    incentives: {
      studentPerJuz: clampMoney(incentives.studentPerJuz, d.incentives.studentPerJuz),
      studentPerKhatm: clampMoney(incentives.studentPerKhatm, d.incentives.studentPerKhatm),
      teacherPerJuz: clampMoney(incentives.teacherPerJuz, d.incentives.teacherPerJuz),
      teacherPerKhatm: clampMoney(incentives.teacherPerKhatm, d.incentives.teacherPerKhatm),
      currency,
    },
    termSplitMonths: clampInt(source.termSplitMonths, 1, 11, d.termSplitMonths),
  };
}

export type ParsedTeacherEvalConfig = { ok: true; config: TeacherEvalConfig } | { ok: false; error: string };

/** يتحقّق من جسم PUT للإعدادات: أي قيمة معطوبة = رفض صريح بدل تجاهلها صامتاً */
export function parseTeacherEvalConfigBody(body: unknown): ParsedTeacherEvalConfig {
  const raw = asObject(body);
  if (Object.keys(raw).length === 0) return { ok: false, error: "الإعدادات غير صحيحة" };

  if (raw.criteria !== undefined) {
    if (normalizeCriteria(raw.criteria) === null) {
      return {
        ok: false,
        error: `المعايير: من ١ إلى ${EVAL_CRITERIA_MAX} معياراً، لكلٍّ اسم ومفتاح فريد (حروف لاتينية/أرقام) ووزن صحيح من ١ إلى ١٠٠`,
      };
    }
  }
  const thresholds = asObject(raw.thresholds);
  if (thresholds.renewMin !== undefined && clampInt(thresholds.renewMin, 1, 100, -1) === -1) {
    return { ok: false, error: "حدّ التجديد لازم يكون رقماً صحيحاً من ١ إلى ١٠٠" };
  }
  if (thresholds.remedialMin !== undefined && clampInt(thresholds.remedialMin, 0, 100, -1) === -1) {
    return { ok: false, error: "حدّ الخطة العلاجية لازم يكون رقماً صحيحاً من ٠ إلى ١٠٠" };
  }
  const merged = mergeTeacherEvalConfig(raw);
  if (
    thresholds.remedialMin !== undefined &&
    thresholds.renewMin !== undefined &&
    (thresholds.remedialMin as number) > (thresholds.renewMin as number)
  ) {
    return { ok: false, error: "حدّ الخطة العلاجية لا يتجاوز حدّ التجديد" };
  }
  const productivity = asObject(raw.productivity);
  if (productivity.minStudentsPassed !== undefined && clampInt(productivity.minStudentsPassed, 1, 500, -1) === -1) {
    return { ok: false, error: "حدّ الطلاب المجتازين لازم يكون رقماً صحيحاً من ١ إلى ٥٠٠" };
  }
  if (productivity.minKhatm !== undefined && clampInt(productivity.minKhatm, 1, 50, -1) === -1) {
    return { ok: false, error: "حدّ الختم لازم يكون رقماً صحيحاً من ١ إلى ٥٠" };
  }
  const incentives = asObject(raw.incentives);
  for (const key of ["studentPerJuz", "studentPerKhatm", "teacherPerJuz", "teacherPerKhatm"] as const) {
    if (incentives[key] !== undefined && clampMoney(incentives[key], -1) === -1) {
      return { ok: false, error: "مبالغ الحوافز لازم تكون أرقاماً من ٠ إلى ١٬٠٠٠٬٠٠٠" };
    }
  }
  return { ok: true, config: merged };
}

// ————— الفترة (عام أو فصل) —————

export type EvalTerm = "year" | "1" | "2";

export function isEvalTerm(value: unknown): value is EvalTerm {
  return value === "year" || value === "1" || value === "2";
}

/** مفتاح الفترة المخزَّن: "1448" للعام و"1448-T1"/"1448-T2" للفصلين */
export function periodKey(year: number, term: EvalTerm): string {
  return term === "year" ? String(year) : `${year}-T${term}`;
}

export function parsePeriodKey(key: string): { year: number; term: EvalTerm } | null {
  const match = /^(\d{4})(?:-T([12]))?$/.exec(key);
  if (!match) return null;
  return { year: Number(match[1]), term: (match[2] as "1" | "2" | undefined) ?? "year" };
}

/** حدود الفترة (ميلادية شاملة): العام كله، أو الفصل الأول حتى termSplitMonths، أو الباقي */
export function periodRange(
  year: number,
  term: EvalTerm,
  permits: PermitsConfig,
  config: TeacherEvalConfig,
): { from: string; to: string } {
  const from = academicYearStart(year, permits);
  const to = academicYearEnd(year, permits);
  if (term === "year") return { from, to };

  const startIndex = year * 12 + (permits.academicYearStartMonth - 1) + config.termSplitMonths;
  const splitKey = formatMonthKey(Math.floor(startIndex / 12), (startIndex % 12) + 1);
  const splitStart = hijriMonthRange(splitKey).start;
  return term === "1" ? { from, to: addDaysISO(splitStart, -1) } : { from: splitStart, to };
}

// ————— الدرجات والتوصية —————

export type EvalScores = Record<string, number | null>;

/** درجة واحدة صحيحة ٠..١٠٠ أو null (لم تُقيَّم) — أي شيء آخر NaN */
export function parseScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isInteger(num) && num >= 0 && num <= 100 ? num : Number.NaN;
}

export type ParsedScores = { ok: true; scores: EvalScores } | { ok: false; error: string };

/** يتحقّق من درجات الجسم بمعايير الإعدادات فقط: مفتاح غريب أو درجة خارج ٠..١٠٠ = رفض */
export function parseScoresBody(body: unknown, criteria: EvalCriterion[]): ParsedScores {
  const raw = asObject(body);
  const known = new Set(criteria.map((c) => c.key));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) return { ok: false, error: "معيار غير معروف" };
  }
  const scores: EvalScores = {};
  for (const criterion of criteria) {
    const parsed = parseScore(raw[criterion.key]);
    if (Number.isNaN(parsed)) return { ok: false, error: `درجة «${criterion.label}» لازم تكون رقماً صحيحاً من ٠ إلى ١٠٠` };
    scores[criterion.key] = parsed;
  }
  return { ok: true, scores };
}

export type EvalTotal = { totalPct: number | null; scoredCount: number; complete: boolean };

/**
 * الدرجة الكلية % = مجموع (درجة المعيار × وزنه) ÷ مجموع الأوزان — لا يشترط أن
 * تساوي الأوزان ١٠٠. لا تُحسب إلا إذا اكتملت كل المعايير (ناقصة = null) حتى لا
 * تُحرَّف التوصية بتقييم جزئي.
 */
export function computeEvaluationTotal(criteria: EvalCriterion[], scores: EvalScores): EvalTotal {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  let weighted = 0;
  let scoredCount = 0;
  for (const c of criteria) {
    const score = scores[c.key];
    if (typeof score === "number") {
      weighted += score * c.weight;
      scoredCount += 1;
    }
  }
  const complete = criteria.length > 0 && scoredCount === criteria.length && totalWeight > 0;
  return {
    totalPct: complete ? Math.round((weighted / totalWeight) * 10) / 10 : null,
    scoredCount,
    complete,
  };
}

export type Recommendation = "renew" | "renew_remedial" | "not_recommended";

export const RECOMMENDATION_LABELS: Record<Recommendation, string> = {
  renew: "يُوصى بالتجديد",
  renew_remedial: "تجديد مع خطة علاجية",
  not_recommended: "لا يُوصى بالتجديد",
};

export function recommendationFor(totalPct: number | null, thresholds: EvalThresholds): Recommendation | null {
  if (totalPct === null) return null;
  if (totalPct >= thresholds.renewMin) return "renew";
  if (totalPct >= thresholds.remedialMin) return "renew_remedial";
  return "not_recommended";
}

// ————— رسوم صفحة تقييم المعلّمين —————

/** سطر معلّم كما ترده لوحة التقييم — الحدود الدنيا التي تحتاجها الرسوم فقط */
export type TeacherEvalRow = {
  id: number;
  name: string;
  evaluation: { totalPct: number | null; recommendation: Recommendation | null } | null;
};

export type EvalStateKey = Recommendation | "incomplete";

export const EVAL_STATE_LABELS: Record<EvalStateKey, string> = {
  ...RECOMMENDATION_LABELS,
  incomplete: "لم يكتمل التقييم",
};

/** أعمدة درجات المعلّمين: من اكتمل تقييمه فقط، الأعلى درجة أولاً (وعند التساوي بالاسم لثبات الترتيب) */
export function teacherScoreBars(teachers: TeacherEvalRow[]): { label: string; value: number }[] {
  return teachers
    .filter((t) => t.evaluation?.totalPct != null)
    .map((t) => ({ label: t.name, value: t.evaluation?.totalPct ?? 0 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "ar"));
}

/** عدد المعلّمين بكل حالة تقييم — المكتملون بتوصيتهم، والباقي «لم يكتمل» (بلا تقييم أو ناقص أو بلا توصية) */
export function evalStateCounts(teachers: TeacherEvalRow[]): { key: EvalStateKey; count: number }[] {
  const counts: Record<EvalStateKey, number> = {
    renew: 0,
    renew_remedial: 0,
    not_recommended: 0,
    incomplete: 0,
  };
  for (const t of teachers) {
    const rec = t.evaluation?.recommendation;
    if (rec) counts[rec] += 1;
    else counts.incomplete += 1;
  }
  return (Object.keys(counts) as EvalStateKey[]).map((key) => ({ key, count: counts[key] }));
}

// ————— الإنتاجية والحوافز —————

/** نتيجة اختبار مجتازة مصغَّرة — تكفي لحساب الإنتاجية والحوافز */
export type PassedExam = {
  studentId: string;
  studentName: string;
  halaqahId: number;
  juzFrom: number;
  juzTo: number;
};

export function juzSpan(exam: Pick<PassedExam, "juzFrom" | "juzTo">): number {
  return Math.max(0, exam.juzTo - exam.juzFrom + 1);
}

/** ختم = اختبار يغطي المصحف كله (٣٠ جزءاً) */
export function isKhatm(exam: Pick<PassedExam, "juzFrom" | "juzTo">): boolean {
  return juzSpan(exam) >= 30;
}

export type Productivity = {
  studentsPassed: number;
  juzPassed: number;
  khatmCount: number;
  meets: boolean;
};

export function computeProductivity(exams: PassedExam[], rule: ProductivityRule): Productivity {
  const students = new Set(exams.map((e) => `${e.halaqahId}:${e.studentId}`));
  const khatmCount = exams.filter(isKhatm).length;
  const juzPassed = exams.reduce((sum, e) => sum + juzSpan(e), 0);
  return {
    studentsPassed: students.size,
    juzPassed,
    khatmCount,
    meets: students.size >= rule.minStudentsPassed || khatmCount >= rule.minKhatm,
  };
}

export type IncentiveLine = {
  studentId: string;
  studentName: string;
  halaqahId: number;
  juz: number;
  khatm: number;
  studentAmount: number;
  teacherAmount: number;
};

export type IncentiveReport = {
  lines: IncentiveLine[];
  totalJuz: number;
  totalKhatm: number;
  studentTotal: number;
  teacherTotal: number;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * حوافز الفترة (عرض فقط): الاختبار العادي = أجزاؤه × سعر الجزء، والختم =
 * سعر الختم وحده (لا يُضاف إليه ٣٠ جزءاً حتى لا يُحسب مرتين). تُجمع أسطر
 * الطالب الواحد في سطر.
 */
export function computeIncentives(exams: PassedExam[], rates: IncentiveRates): IncentiveReport {
  const by = new Map<string, IncentiveLine>();
  for (const exam of exams) {
    const key = `${exam.halaqahId}:${exam.studentId}`;
    const line =
      by.get(key) ??
      ({
        studentId: exam.studentId,
        studentName: exam.studentName,
        halaqahId: exam.halaqahId,
        juz: 0,
        khatm: 0,
        studentAmount: 0,
        teacherAmount: 0,
      } satisfies IncentiveLine);
    if (isKhatm(exam)) {
      line.khatm += 1;
      line.studentAmount += rates.studentPerKhatm;
      line.teacherAmount += rates.teacherPerKhatm;
    } else {
      const span = juzSpan(exam);
      line.juz += span;
      line.studentAmount += span * rates.studentPerJuz;
      line.teacherAmount += span * rates.teacherPerJuz;
    }
    by.set(key, line);
  }
  const lines = [...by.values()].map((l) => ({
    ...l,
    studentAmount: round2(l.studentAmount),
    teacherAmount: round2(l.teacherAmount),
  }));
  return {
    lines,
    totalJuz: lines.reduce((s, l) => s + l.juz, 0),
    totalKhatm: lines.reduce((s, l) => s + l.khatm, 0),
    studentTotal: round2(lines.reduce((s, l) => s + l.studentAmount, 0)),
    teacherTotal: round2(lines.reduce((s, l) => s + l.teacherAmount, 0)),
  };
}

/** مؤشرات تُملأ تلقائياً من بيانات النظام وقت الحفظ — تُخزَّن لقطةً مع التقييم */
export type EvalIndicators = {
  attendanceRate: number | null;
  planOnTrackRatio: number | null;
  studentsPassed: number;
  juzPassed: number;
  khatmCount: number;
  meetsProductivity: boolean;
  /** أيام غياب المعلّم — إدخال يدوي إن سُجّل (لا جدول لغياب المعلّم) */
  teacherAbsenceDays: number | null;
};

export function parseAbsenceDays(value: unknown): number | null | typeof Number.NaN {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isInteger(num) && num >= 0 && num <= 366 ? num : Number.NaN;
}
