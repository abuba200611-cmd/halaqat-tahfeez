/*
  STEP 63 — الخطة الشهرية: منطق نقي (بلا قاعدة بيانات) يشاركه الخادم
  والواجهة والاختبارات. الخطة المخزَّنة هي المستهدف فقط؛ الإنجاز الفعلي
  يُحسب دائماً من ward_logs ولا يُخزَّن أبداً.
*/
import { elapsedFraction, isValidMonthKey, type MonthRange } from "./hijri";
import { parseAyahRange } from "./ward-ayah";
import { hifzPagesCovered } from "./student-ward-display";
import { TOTAL_MUSHAF_PAGES } from "./quran-surahs";
import type { AyahRange, PageRange } from "./types";

export const PLAN_NOTES_MAX = 500;
export const PLAN_MAX_TARGET = TOTAL_MUSHAF_PAGES;
/** هامش التسامح حول المتوقَّع النسبي قبل أن نقول "متقدّم" أو "متأخر" */
export const PLAN_STATUS_TOLERANCE = 0.1;

export type PlanStatus = "ahead" | "on_track" | "behind";

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  ahead: "متقدّم",
  on_track: "على المسار",
  behind: "متأخر",
};

export type PlanTargets = {
  hifzPagesTarget: number;
  reviewPagesTarget: number;
  /** نطاق الحفظ المخطّط (سورة/آية) — اختياري */
  hifz: AyahRange | null;
  notes: string | null;
};

export type StoredPlan = PlanTargets & { studentId: string; month: string };

export type PlanActual = { hifzPages: number; reviewPages: number };

/** صفّ ورد مصغَّر لحساب الإنجاز — الأوراد المرفوضة (needs_revision) لا تدخل هنا أصلاً */
export type ActualWardRow = { studentId: string; hifz: PageRange | null; reviewPages: number };

/**
 * الإنجاز الفعلي لكل طالب: صفحات حفظ مميّزة (نفس hifzPagesCovered المستخدم
 * بلوحة الطالب) + مجموع صفحات المراجعة. يُمرَّر هنا أوراد الشهر غير المرفوضة فقط.
 */
export function computeActuals(rows: ActualWardRow[]): Record<string, PlanActual> {
  const byStudent = new Map<string, ActualWardRow[]>();
  for (const r of rows) {
    const list = byStudent.get(r.studentId) ?? [];
    list.push(r);
    byStudent.set(r.studentId, list);
  }
  const out: Record<string, PlanActual> = {};
  for (const [studentId, list] of byStudent) {
    out[studentId] = {
      hifzPages: hifzPagesCovered(list),
      reviewPages: list.reduce((sum, r) => sum + Math.max(0, r.reviewPages), 0),
    };
  }
  return out;
}

export const EMPTY_ACTUAL: PlanActual = { hifzPages: 0, reviewPages: 0 };

export type PlanProgress = {
  hasPlan: boolean;
  /** النسبة المئوية (قد تتجاوز ١٠٠) أو null لو لا مستهدف لهذا البند */
  hifzPct: number | null;
  reviewPct: number | null;
  /** (حفظ + مراجعة) ÷ (مستهدف الحفظ + مستهدف المراجعة) */
  overallPct: number | null;
  /** النسبة المتوقَّعة حتى اليوم بحسب أيام الشهر المنقضية */
  expectedPct: number;
  status: PlanStatus | null;
};

function pctOf(actual: number, target: number): number | null {
  return target > 0 ? Math.round((actual / target) * 100) : null;
}

/** الحالة بالمقارنة النسبية: ratio = الإنجاز÷المستهدف، expected = ما انقضى من الشهر */
export function planStatus(ratio: number, expected: number): PlanStatus {
  if (ratio >= 1 || ratio >= expected + PLAN_STATUS_TOLERANCE) return "ahead";
  if (ratio >= expected - PLAN_STATUS_TOLERANCE) return "on_track";
  return "behind";
}

export function summarizePlan(
  plan: Pick<PlanTargets, "hifzPagesTarget" | "reviewPagesTarget"> | null,
  actual: PlanActual,
  range: MonthRange,
  today: string,
): PlanProgress {
  const expected = elapsedFraction(range, today);
  const expectedPct = Math.round(expected * 100);
  const totalTarget = plan ? plan.hifzPagesTarget + plan.reviewPagesTarget : 0;
  if (!plan || totalTarget === 0) {
    return { hasPlan: !!plan, hifzPct: null, reviewPct: null, overallPct: null, expectedPct, status: null };
  }
  const ratio = (actual.hifzPages + actual.reviewPages) / totalTarget;
  return {
    hasPlan: true,
    hifzPct: pctOf(actual.hifzPages, plan.hifzPagesTarget),
    reviewPct: pctOf(actual.reviewPages, plan.reviewPagesTarget),
    overallPct: Math.round(ratio * 100),
    expectedPct,
    status: planStatus(ratio, expected),
  };
}

export type ParsedPlanBody =
  | { ok: true; studentId: string; month: string; targets: PlanTargets }
  | { ok: false; error: string };

function parseTarget(value: unknown, label: string): number | string {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > PLAN_MAX_TARGET) {
    return `مستهدف ${label} لازم يكون رقماً صحيحاً من ٠ إلى ${PLAN_MAX_TARGET}`;
  }
  return value;
}

/**
 * يتحقّق من جسم PUT /api/plans بالكامل: الطالب، الشهر الهجري، المستهدفان،
 * نطاق الحفظ الاختياري (سورة/آية صالحة وبالترتيب)، والملاحظات.
 * الجسم: { studentId, month, hifzPagesTarget, reviewPagesTarget,
 *          hifz?: { from: {surah, ayah}, to: {surah, ayah} } | null, notes?: string | null }
 */
export function parsePlanBody(body: Record<string, unknown>): ParsedPlanBody {
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId) return { ok: false, error: "الطالب مفقود" };
  if (!isValidMonthKey(body.month)) return { ok: false, error: "شهر غير صحيح" };

  const hifzTarget = parseTarget(body.hifzPagesTarget, "الحفظ");
  if (typeof hifzTarget === "string") return { ok: false, error: hifzTarget };
  const reviewTarget = parseTarget(body.reviewPagesTarget, "المراجعة");
  if (typeof reviewTarget === "string") return { ok: false, error: reviewTarget };

  let hifz: AyahRange | null = null;
  if (body.hifz !== undefined && body.hifz !== null) {
    if (typeof body.hifz !== "object" || Array.isArray(body.hifz)) return { ok: false, error: "نطاق الحفظ غير صحيح" };
    try {
      hifz = parseAyahRange(body.hifz as Parameters<typeof parseAyahRange>[0], "الحفظ")?.ayah ?? null;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "نطاق الحفظ غير صحيح" };
    }
  }

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") return { ok: false, error: "ملاحظة غير صحيحة" };
    const trimmed = body.notes.trim().slice(0, PLAN_NOTES_MAX);
    notes = trimmed === "" ? null : trimmed;
  }

  return {
    ok: true,
    studentId,
    month: body.month,
    targets: { hifzPagesTarget: hifzTarget, reviewPagesTarget: reviewTarget, hifz, notes },
  };
}

/** صف خطة الطالب كما يرجع من واجهات القراءة (معلّم/طالب/ولي) */
export type PlanView = {
  month: string;
  monthLabel: string;
  start: string;
  end: string;
  plan: PlanTargets | null;
  actual: PlanActual;
  progress: PlanProgress;
};
