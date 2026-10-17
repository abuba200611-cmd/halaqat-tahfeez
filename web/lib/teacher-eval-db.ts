import "server-only";

import { db } from "./db";
import { getHalaqahMetrics } from "./metrics-db";
import { getMosqueSetting, setMosqueSetting } from "./mosque-settings-db";
import { academicYearOf } from "./permits";
import { getPermitsConfig } from "./permits-db";
import { riyadhTodayISO } from "./riyadh-date";
import {
  computeEvaluationTotal,
  computeIncentives,
  computeProductivity,
  EVAL_NOTES_MAX,
  isEvalTerm,
  mergeTeacherEvalConfig,
  periodKey,
  periodRange,
  recommendationFor,
  type EvalIndicators,
  type EvalScores,
  type EvalTerm,
  type IncentiveReport,
  type PassedExam,
  type Productivity,
  type Recommendation,
  type TeacherEvalConfig,
} from "./teacher-eval";

/*
  A3 — الوصول لتقييمات المعلّمين (teacher_evaluations) وحساب مؤشراتها
  التلقائية والحوافز من جداول الحلقات والاختبارات لحظة العرض. كل دالة تقيّد
  المعلّم بجامعها (halaqahs.mosque_id) — لا ثقة بمعرّف معلّم من العميل.
*/

export async function getTeacherEvalConfig(mosqueId: number): Promise<TeacherEvalConfig> {
  return mergeTeacherEvalConfig(await getMosqueSetting(mosqueId, "teacher_eval"));
}

export async function setTeacherEvalConfig(mosqueId: number, config: TeacherEvalConfig): Promise<void> {
  await setMosqueSetting(mosqueId, "teacher_eval", config);
}

export type EvalTeacher = {
  id: number;
  name: string;
  halaqahId: number;
  halaqahName: string;
  role: "supervisor" | "assistant";
};

/** معلّمو الجامع الفعّالون (غير الموقوفة حساباتهم) مع حلقاتهم */
export async function listEvalTeachers(mosqueId: number): Promise<EvalTeacher[]> {
  const rows = await db().sql`
    SELECT t.id, COALESCE(NULLIF(t.teacher_name, ''), t.username) AS name, t.halaqah_id, h.name AS halaqah_name, t.role
    FROM teachers t
    JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE h.mosque_id = ${mosqueId} AND t.deactivated_at IS NULL
    ORDER BY h.name, (t.role = 'supervisor') DESC, name
  `;
  return rows.map(rowToTeacher);
}

function rowToTeacher(r: Record<string, unknown>): EvalTeacher {
  return {
    id: Number(r.id),
    name: r.name as string,
    halaqahId: Number(r.halaqah_id),
    halaqahName: r.halaqah_name as string,
    role: r.role === "assistant" ? "assistant" : "supervisor",
  };
}

export async function getEvalTeacher(mosqueId: number, teacherId: number): Promise<EvalTeacher | null> {
  const rows = await db().sql`
    SELECT t.id, COALESCE(NULLIF(t.teacher_name, ''), t.username) AS name, t.halaqah_id, h.name AS halaqah_name, t.role
    FROM teachers t
    JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE t.id = ${teacherId} AND h.mosque_id = ${mosqueId}
  `;
  return rows[0] ? rowToTeacher(rows[0]) : null;
}

/** الاختبارات المجتازة لحلقات الجامع في نطاق تواريخ الجلسات (يُقيَّد بحلقة اختيارياً) */
export async function listPassedExams(
  mosqueId: number,
  range: { from: string; to: string },
  halaqahId?: number,
): Promise<PassedExam[]> {
  const only = halaqahId ?? null;
  const rows = await db().sql`
    SELECT r.halaqah_id, r.student_id, s.name AS student_name, r.juz_from, r.juz_to
    FROM exam_results r
    JOIN exam_sessions es ON es.id = r.session_id
    JOIN students s ON s.teacher_id = r.halaqah_id AND s.id = r.student_id
    WHERE r.mosque_id = ${mosqueId} AND r.passed
      AND es.session_date >= ${range.from}::date AND es.session_date <= ${range.to}::date
      AND (${only}::int IS NULL OR r.halaqah_id = ${only})
    ORDER BY r.halaqah_id, s.name, r.juz_from
  `;
  return rows.map((r) => ({
    halaqahId: Number(r.halaqah_id),
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    juzFrom: Number(r.juz_from),
    juzTo: Number(r.juz_to),
  }));
}

/** المؤشرات التلقائية لمعلّم ضمن فترة (الحضور وتقدّم الخطط من مقاييس الحلقة، والإنتاجية من الاختبارات) */
export async function computeTeacherIndicators(
  mosqueId: number,
  teacher: EvalTeacher,
  range: { from: string; to: string },
  config: TeacherEvalConfig,
  teacherAbsenceDays: number | null,
): Promise<EvalIndicators & { productivity: Productivity }> {
  const today = riyadhTodayISO();
  const to = range.to < today ? range.to : today;
  const from = range.from <= to ? range.from : to;

  let attendanceRate: number | null = null;
  let planOnTrackRatio: number | null = null;
  try {
    const metrics = await getHalaqahMetrics(
      { id: teacher.halaqahId, halaqahName: teacher.halaqahName, teacherName: teacher.name },
      { from, to },
      today,
    );
    attendanceRate = metrics.totals.attendanceRate;
    planOnTrackRatio = metrics.totals.planOnTrackRatio;
  } catch {
    // فشل مقياس الحلقة لا يكسر نموذج التقييم — يظهر المؤشر "غير متاح"
  }

  const exams = await listPassedExams(mosqueId, range, teacher.halaqahId);
  const productivity = computeProductivity(exams, config.productivity);
  return {
    attendanceRate,
    planOnTrackRatio,
    studentsPassed: productivity.studentsPassed,
    juzPassed: productivity.juzPassed,
    khatmCount: productivity.khatmCount,
    meetsProductivity: productivity.meets,
    teacherAbsenceDays,
    productivity,
  };
}

export type StoredEvaluation = {
  teacherId: number;
  period: string;
  scores: EvalScores;
  indicators: Partial<EvalIndicators>;
  totalPct: number | null;
  recommendation: Recommendation | null;
  notes: string;
  evaluatedBy: string;
  updatedAt: string;
};

function rowToEvaluation(r: Record<string, unknown>): StoredEvaluation {
  return {
    teacherId: Number(r.teacher_id),
    period: r.period as string,
    scores: (r.scores as EvalScores) ?? {},
    indicators: (r.indicators as Partial<EvalIndicators>) ?? {},
    totalPct: r.total_pct === null || r.total_pct === undefined ? null : Number(r.total_pct),
    recommendation: (r.recommendation as Recommendation | null) ?? null,
    notes: (r.notes as string) ?? "",
    evaluatedBy: (r.evaluated_by as string) ?? "",
    updatedAt: new Date(r.updated_at as string).toISOString(),
  };
}

export async function getEvaluation(mosqueId: number, teacherId: number, period: string): Promise<StoredEvaluation | null> {
  const rows = await db().sql`
    SELECT teacher_id, period, scores, indicators, total_pct, recommendation, notes, evaluated_by, updated_at
    FROM teacher_evaluations
    WHERE mosque_id = ${mosqueId} AND teacher_id = ${teacherId} AND period = ${period}
  `;
  return rows[0] ? rowToEvaluation(rows[0]) : null;
}

export async function listEvaluations(mosqueId: number, period: string): Promise<StoredEvaluation[]> {
  const rows = await db().sql`
    SELECT teacher_id, period, scores, indicators, total_pct, recommendation, notes, evaluated_by, updated_at
    FROM teacher_evaluations
    WHERE mosque_id = ${mosqueId} AND period = ${period}
  `;
  return rows.map(rowToEvaluation);
}

export async function saveEvaluation(input: {
  mosqueId: number;
  teacher: EvalTeacher;
  year: number;
  term: EvalTerm;
  scores: EvalScores;
  notes: string;
  teacherAbsenceDays: number | null;
  evaluatedBy: string;
  config: TeacherEvalConfig;
}): Promise<StoredEvaluation> {
  const permits = await getPermitsConfig(input.mosqueId);
  const range = periodRange(input.year, input.term, permits, input.config);
  const indicators = await computeTeacherIndicators(
    input.mosqueId,
    input.teacher,
    range,
    input.config,
    input.teacherAbsenceDays,
  );
  // لقطة المؤشرات المخزَّنة بلا كائن الإنتاجية المركّب (مكرر لحقوله)
  const snapshot: EvalIndicators = {
    attendanceRate: indicators.attendanceRate,
    planOnTrackRatio: indicators.planOnTrackRatio,
    studentsPassed: indicators.studentsPassed,
    juzPassed: indicators.juzPassed,
    khatmCount: indicators.khatmCount,
    meetsProductivity: indicators.meetsProductivity,
    teacherAbsenceDays: indicators.teacherAbsenceDays,
  };
  const total = computeEvaluationTotal(input.config.criteria, input.scores);
  const recommendation = recommendationFor(total.totalPct, input.config.thresholds);
  const period = periodKey(input.year, input.term);

  const rows = await db().sql`
    INSERT INTO teacher_evaluations
      (mosque_id, teacher_id, halaqah_id, period, scores, indicators, total_pct, recommendation, notes, evaluated_by)
    VALUES
      (${input.mosqueId}, ${input.teacher.id}, ${input.teacher.halaqahId}, ${period},
       ${JSON.stringify(input.scores)}::jsonb, ${JSON.stringify(snapshot)}::jsonb,
       ${total.totalPct}, ${recommendation}, ${input.notes.slice(0, EVAL_NOTES_MAX)}, ${input.evaluatedBy})
    ON CONFLICT (teacher_id, period) DO UPDATE SET
      halaqah_id = excluded.halaqah_id, scores = excluded.scores, indicators = excluded.indicators,
      total_pct = excluded.total_pct, recommendation = excluded.recommendation, notes = excluded.notes,
      evaluated_by = excluded.evaluated_by, updated_at = now()
    RETURNING teacher_id, period, scores, indicators, total_pct, recommendation, notes, evaluated_by, updated_at
  `;
  return rowToEvaluation(rows[0]);
}

export type HalaqahIncentive = {
  halaqahId: number;
  halaqahName: string;
  teacherNames: string;
  report: IncentiveReport;
};

/** تقرير حوافز الفترة لكل حلقة في الجامع (عرض فقط — لا مدفوعات) */
export async function buildIncentiveReport(
  mosqueId: number,
  range: { from: string; to: string },
  config: TeacherEvalConfig,
): Promise<{ halaqat: HalaqahIncentive[]; total: IncentiveReport }> {
  const [exams, halaqat] = await Promise.all([
    listPassedExams(mosqueId, range),
    db().sql`
      SELECT h.id, h.name,
             COALESCE((
               SELECT string_agg(COALESCE(NULLIF(t.teacher_name, ''), t.username), '، ' ORDER BY (t.role = 'supervisor') DESC)
               FROM teachers t WHERE t.halaqah_id = h.id AND t.deactivated_at IS NULL
             ), '') AS teacher_names
      FROM halaqahs h WHERE h.mosque_id = ${mosqueId} ORDER BY h.name
    `,
  ]);
  const perHalaqah = halaqat.map((h) => ({
    halaqahId: Number(h.id),
    halaqahName: h.name as string,
    teacherNames: (h.teacher_names as string) ?? "",
    report: computeIncentives(
      exams.filter((e) => e.halaqahId === Number(h.id)),
      config.incentives,
    ),
  }));
  return { halaqat: perHalaqah, total: computeIncentives(exams, config.incentives) };
}

export type ResolvedEvalPeriod = {
  year: number;
  term: EvalTerm;
  key: string;
  range: { from: string; to: string };
  config: TeacherEvalConfig;
};

/** يحلّ ?year=&term= (الافتراضي: العام الدراسي الحالي كاملاً) — رفض صريح للقيم المعطوبة */
export async function resolveEvalPeriod(
  mosqueId: number,
  params: URLSearchParams,
): Promise<{ ok: true; period: ResolvedEvalPeriod } | { ok: false; error: string }> {
  const [permits, config] = await Promise.all([getPermitsConfig(mosqueId), getTeacherEvalConfig(mosqueId)]);
  const rawYear = params.get("year");
  const rawTerm = params.get("term");
  const year = rawYear === null ? academicYearOf(riyadhTodayISO(), permits) : Number(rawYear);
  if (!Number.isInteger(year) || year < 1300 || year > 1600 || (rawYear !== null && !/^\d{4}$/.test(rawYear))) {
    return { ok: false, error: "عام دراسي غير صالح" };
  }
  const term = rawTerm === null ? "year" : rawTerm;
  if (!isEvalTerm(term)) return { ok: false, error: "فترة غير صالحة" };
  return {
    ok: true,
    period: { year, term, key: periodKey(year, term), range: periodRange(year, term, permits, config), config },
  };
}
