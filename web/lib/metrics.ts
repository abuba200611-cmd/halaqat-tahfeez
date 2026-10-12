/*
  STEP 66 — مقاييس الحلقة لنظام إدارة الجامع (GET /api/link/metrics):
  منطق نقي بلا قاعدة بيانات — تحليل نطاق التاريخ وبناء الاستجابة كلها
  من صفوف مجمَّعة جاهزة تجلبها lib/metrics-db.ts بعدد استعلامات ثابت.
  يعيد استخدام قواعد الحساب القائمة نفسها: دمج الحضور الضمني من
  lib/attendance، حالة الخطة وتقدّمها من lib/monthly-plan، والتتابع
  وصفحات الحفظ المختلفة من lib/student-ward-display.

  الخصوصية عقد صريح هنا: أسماء وأرقاماً فقط — لا هواتف ولا حسابات ولا
  ملاحظات معلّم/ولي أمر (يُثبَت باختبار مفاتيح الاستجابة حرفياً).
*/
import { daysBeforeISO, isValidAttendanceDate, type AttendanceStatus } from "./attendance";
import { engagementScore } from "./engagement";
import { hijriMonthRange, hijriMonthOfISO } from "./hijri";
import { EMPTY_ACTUAL, summarizePlan, type PlanActual, type PlanStatus } from "./monthly-plan";
import { computeStreak, hifzPagesCovered } from "./student-ward-display";
import type { WardStatus } from "./types";

export const METRICS_RANGE_DEFAULT_DAYS = 30;
export const METRICS_RANGE_MAX_DAYS = 120;

export type MetricsRange = { from: string; to: string };

export type ParsedMetricsRange = { ok: true; from: string; to: string } | { ok: false; error: string };

/**
 * نطاق [from, to] شامل الطرفين — افتراضياً آخر ٣٠ يوماً تنتهي اليوم
 * (`today` بتوقيت الرياض يمرّره المسار). لو أُرسل حدّ واحد كمّل الآخر
 * بالافتراض نفسه. يرفض: تاريخاً غير صحيح تقويمياً، "من" بعد "إلى"،
 * ومدى أطول من ١٢٠ يوماً شاملة الطرفين.
 */
export function parseMetricsRange(
  fromParam: string | null,
  toParam: string | null,
  today: string,
): ParsedMetricsRange {
  const to = toParam?.trim() || today;
  if (!isValidAttendanceDate(to)) return { ok: false, error: "تاريخ إلى غير صحيح" };
  // الافتراضي يُشتق من "إلى" — لا يُحسب إلا بعد صلاحه، وإلا انفجر daysBeforeISO بتاريخ فاسد
  const from = fromParam?.trim() || daysBeforeISO(to, METRICS_RANGE_DEFAULT_DAYS - 1);
  if (!isValidAttendanceDate(from)) return { ok: false, error: "تاريخ من غير صحيح" };
  if (from > to) return { ok: false, error: "تاريخ من بعد تاريخ إلى" };
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (days > METRICS_RANGE_MAX_DAYS) return { ok: false, error: "المدى أطول من ١٢٠ يوماً" };
  return { ok: true, from, to };
}

/** طالب فعّال غير محذوف مع مستهدفي خطة الشهر الهجري الجاري (إن وُجدت) */
export type MetricsStudentRow = {
  id: string;
  name: string;
  plan: { hifzPagesTarget: number; reviewPagesTarget: number } | null;
};

/**
 * صفّ ورد داخل النطاق بأي حالة: needs_revision تُحتسب تسليماً وحضوراً
 * ضمنياً وتتابعاً، لكنها لا تدخل صفحات الحفظ/المراجعة (نفس معيار إنجاز
 * الخطة في lib/plan-db).
 */
export type MetricsWardRow = {
  studentId: string;
  date: string;
  status: WardStatus;
  hifz: { from: number; to: number } | null;
  reviewPages: number;
};

export type MetricsAttendanceRow = { studentId: string; date: string; status: AttendanceStatus };

/** تجميع تلاوات الطالب داخل النطاق: count الكل، scored/scoreSum للمقيَّمة فقط */
export type MetricsRecitationRow = { studentId: string; count: number; scored: number; scoreSum: number };

export type HalaqahMetricsInput = {
  halaqahName: string;
  teacherName: string;
  /** اليوم بتوقيت الرياض — يحدّد الشهر الهجري الجاري والنطاق الافتراضي */
  today: string;
  range: MetricsRange;
  /** الطلاب الفعّالون غير المحذوفين */
  students: MetricsStudentRow[];
  /** أوراد النطاق الميلادي وقرارات الحضور المخزَّنة فيه — مفروض مفلترة للنطاق */
  wards: MetricsWardRow[];
  attendance: MetricsAttendanceRow[];
  /** إنجاز الشهر الهجري الجاري من ward_logs (خارج النطاق المطلوب أحياناً) */
  planActuals: Record<string, PlanActual>;
  /** تجميع التلاوات داخل النطاق */
  recitations: MetricsRecitationRow[];
};

export type StudentMetrics = {
  id: string;
  name: string;
  wards: number;
  approved: number;
  attendanceRate: number | null;
  streak: number;
  hifzPagesInRange: number;
  reviewPagesInRange: number;
  plan: { status: PlanStatus | null; progressPct: number | null } | null;
  recitations: { count: number; avgScore: number | null };
  engagementScore: number;
};

export type HalaqahMetrics = {
  halaqah: { name: string; teacherName: string; activeStudents: number };
  totals: {
    wardsSubmitted: number;
    wardsApproved: number;
    attendanceRate: number | null;
    planOnTrackRatio: number | null;
    recitations: { count: number; avgScore: number | null };
    hifzPagesInRange: number;
  };
  students: StudentMetrics[];
};

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const by = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = by.get(k) ?? [];
    list.push(row);
    by.set(k, list);
  }
  return by;
}

/**
 * يبني الاستجابة كاملة من الصفوف المجمَّعة. الحضور بنفس قاعدة
 * summarizeAttendance: يوم به ورد (أي حالة) حاضر ضمني، والصفّ المخزَّن
 * يغلبه دائماً؛ المحسوب = حاضر+متأخر. التتابع يُقاس حتى نهاية النطاق
 * (computeStreak بنطاق اليوم المطلوب) فلا يتجاوز طوله أبداً.
 */
export function buildHalaqahMetrics(input: HalaqahMetricsInput): HalaqahMetrics {
  const wardsBy = groupBy(input.wards, (w) => w.studentId);
  const attendanceBy = groupBy(input.attendance, (a) => a.studentId);
  const recitationsBy = new Map(input.recitations.map((r) => [r.studentId, r]));
  const monthRange = hijriMonthRange(hijriMonthOfISO(input.today));

  let wardsSubmitted = 0;
  let wardsApproved = 0;
  let hifzPagesInRange = 0;
  let presentLateDays = 0;
  let countedDays = 0;
  let studentsWithPlan = 0;
  let studentsOnTrack = 0;
  let recitationsCount = 0;
  let recitationsScored = 0;
  let recitationsScoreSum = 0;

  const students: StudentMetrics[] = input.students.map((s) => {
    const wards = wardsBy.get(s.id) ?? [];
    const approved = wards.filter((w) => w.status === "approved").length;
    wardsSubmitted += wards.length;
    wardsApproved += approved;

    const dayStatus = new Map<string, AttendanceStatus>();
    for (const w of wards) dayStatus.set(w.date, "present");
    for (const a of attendanceBy.get(s.id) ?? []) dayStatus.set(a.date, a.status);
    let presentLate = 0;
    for (const status of dayStatus.values()) {
      if (status === "present" || status === "late") presentLate++;
    }
    const attendanceRate = dayStatus.size ? Math.round((presentLate / dayStatus.size) * 100) : null;
    presentLateDays += presentLate;
    countedDays += dayStatus.size;

    const wardDays = new Set(wards.map((w) => w.date)).size;
    const wardConsistency = dayStatus.size > 0 ? wardDays / dayStatus.size : null;

    const counted = wards.filter((w) => w.status !== "needs_revision");
    const studentHifzPages = hifzPagesCovered(counted);
    const reviewPages = counted.reduce((sum, w) => sum + Math.max(0, w.reviewPages), 0);
    hifzPagesInRange += studentHifzPages;

    const progress = summarizePlan(s.plan, input.planActuals[s.id] ?? EMPTY_ACTUAL, monthRange, input.today);
    if (s.plan) {
      studentsWithPlan++;
      if (progress.status === "on_track" || progress.status === "ahead") studentsOnTrack++;
    }

    const rec = recitationsBy.get(s.id);
    const recCount = rec?.count ?? 0;
    const recAvg = rec && rec.scored > 0 ? Math.round((rec.scoreSum / rec.scored) * 10) / 10 : null;
    recitationsCount += recCount;
    if (rec) {
      recitationsScored += rec.scored;
      recitationsScoreSum += rec.scoreSum;
    }

    return {
      id: s.id,
      name: s.name,
      wards: wards.length,
      approved,
      attendanceRate,
      streak: computeStreak(wards.map((w) => w.date), input.range.to),
      hifzPagesInRange: studentHifzPages,
      reviewPagesInRange: reviewPages,
      plan: s.plan ? { status: progress.status, progressPct: progress.overallPct } : null,
      recitations: { count: recCount, avgScore: recAvg },
      engagementScore: engagementScore({
        attendanceRate,
        wardConsistency,
        planProgressPct: progress.overallPct,
        recitationAvg: recAvg,
      }),
    };
  });

  return {
    halaqah: {
      name: input.halaqahName,
      teacherName: input.teacherName,
      activeStudents: input.students.length,
    },
    totals: {
      wardsSubmitted,
      wardsApproved,
      attendanceRate: countedDays > 0 ? Math.round((presentLateDays / countedDays) * 100) : null,
      planOnTrackRatio:
        studentsWithPlan > 0 ? Math.round((studentsOnTrack / studentsWithPlan) * 100) / 100 : null,
      recitations: {
        count: recitationsCount,
        avgScore: recitationsScored > 0 ? Math.round((recitationsScoreSum / recitationsScored) * 10) / 10 : null,
      },
      hifzPagesInRange,
    },
    students,
  };
}
