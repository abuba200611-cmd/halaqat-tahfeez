import "server-only";

import { db } from "./db";
import { hijriMonthRange, monthLabel } from "./hijri";
import {
  EMPTY_ACTUAL,
  computeActuals,
  summarizePlan,
  type ActualWardRow,
  type PlanActual,
  type PlanTargets,
  type PlanView,
  type StoredPlan,
} from "./monthly-plan";
import type { AyahRange } from "./types";

/*
  STEP 63 — الوصول لجدول monthly_plans وحساب الإنجاز من ward_logs. ملف
  مستقل حتى لا يتضخّم lib/db.ts. halaqahId يطابق students.teacher_id؛ لا
  استعلام هنا يقبل معرّف حلقة من العميل — المسارات تمرّره من الجلسة فقط.
*/

function rowToPlan(r: Record<string, unknown>): StoredPlan {
  const fromSurah = r.hifz_from_surah as number | null;
  const fromAyah = r.hifz_from_ayah as number | null;
  const toSurah = r.hifz_to_surah as number | null;
  const toAyah = r.hifz_to_ayah as number | null;
  const hifz: AyahRange | null =
    fromSurah !== null && fromAyah !== null && toSurah !== null && toAyah !== null
      ? { fromSurah, fromAyah, toSurah, toAyah }
      : null;
  return {
    studentId: r.student_id as string,
    month: r.month as string,
    hifz,
    hifzPagesTarget: r.hifz_pages_target as number,
    reviewPagesTarget: r.review_pages_target as number,
    notes: (r.notes as string | null) ?? null,
  };
}

/**
 * الإنجاز الفعلي لأوراد النطاق الميلادي [start, end]. الأوراد المرفوضة
 * (status = 'needs_revision') لا تُحتسب؛ new/seen/approved تُحتسب (نفس
 * معيار hifzPagesCovered: المعتمدة وغير المعتمدة معاً). صفحات المراجعة =
 * مجموع مقاطع STEP 52 لو وُجدت، وإلا الفرق القديم review_to-review_from+1
 * (نفس منطق rowToWard.reviewPagesTotal).
 */
export async function getMonthActuals(
  halaqahId: number,
  start: string,
  end: string,
  studentId?: string,
): Promise<Record<string, PlanActual>> {
  const only = studentId ?? null;
  const rows = await db().sql`
    SELECT w.student_id, w.hifz_from, w.hifz_to,
           COALESCE(
             (SELECT SUM(rs.to_page - rs.from_page + 1) FROM ward_review_segments rs WHERE rs.ward_log_id = w.id),
             CASE WHEN w.review_from IS NOT NULL AND w.review_to IS NOT NULL THEN w.review_to - w.review_from + 1 END,
             0
           )::int AS review_pages
    FROM ward_logs w
    WHERE w.teacher_id = ${halaqahId} AND w.date >= ${start} AND w.date <= ${end}
      AND w.status <> 'needs_revision'
      AND (${only}::text IS NULL OR w.student_id = ${only})
  `;
  const wardRows: ActualWardRow[] = rows.map((r) => ({
    studentId: r.student_id as string,
    hifz:
      r.hifz_from !== null && r.hifz_to !== null
        ? { from: r.hifz_from as number, to: r.hifz_to as number }
        : null,
    reviewPages: Number(r.review_pages ?? 0),
  }));
  return computeActuals(wardRows);
}

export type HalaqahPlanRow = { studentId: string; name: string; plan: PlanTargets | null };

/** طلاب الحلقة الفعّالون غير المحذوفين مع خطة الشهر (إن وُجدت) */
export async function listHalaqahPlans(halaqahId: number, month: string): Promise<HalaqahPlanRow[]> {
  const rows = await db().sql`
    SELECT s.id AS student_id, s.name, p.month,
           p.hifz_from_surah, p.hifz_from_ayah, p.hifz_to_surah, p.hifz_to_ayah,
           p.hifz_pages_target, p.review_pages_target, p.notes
    FROM students s
    LEFT JOIN monthly_plans p
      ON p.halaqah_id = s.teacher_id AND p.student_id = s.id AND p.month = ${month}
    WHERE s.teacher_id = ${halaqahId} AND s.active AND s.deleted_at IS NULL
    ORDER BY s.sort_order, s.name
  `;
  return rows.map((r) => ({
    studentId: r.student_id as string,
    name: r.name as string,
    plan: r.month ? rowToPlan(r) : null,
  }));
}

/**
 * يحفظ/يحدّث خطة طالب لشهر. شرط الطالب (نفس الحلقة، فعّال، غير محذوف)
 * داخل الاستعلام نفسه — طالب من حلقة أخرى أو محذوف يرجع false بلا أي كتابة.
 */
export async function upsertPlan(
  halaqahId: number,
  createdBy: number,
  studentId: string,
  month: string,
  t: PlanTargets,
): Promise<boolean> {
  const h = t.hifz;
  const rows = await db().sql`
    INSERT INTO monthly_plans (
      halaqah_id, student_id, month,
      hifz_from_surah, hifz_from_ayah, hifz_to_surah, hifz_to_ayah,
      hifz_pages_target, review_pages_target, notes, created_by, updated_at
    )
    SELECT s.teacher_id, s.id, ${month}::text,
           ${h?.fromSurah ?? null}::int, ${h?.fromAyah ?? null}::int, ${h?.toSurah ?? null}::int, ${h?.toAyah ?? null}::int,
           ${t.hifzPagesTarget}::int, ${t.reviewPagesTarget}::int, ${t.notes}::text, ${createdBy}::int, now()
    FROM students s
    WHERE s.teacher_id = ${halaqahId} AND s.id = ${studentId} AND s.active AND s.deleted_at IS NULL
    ON CONFLICT (halaqah_id, student_id, month) DO UPDATE SET
      hifz_from_surah = excluded.hifz_from_surah,
      hifz_from_ayah = excluded.hifz_from_ayah,
      hifz_to_surah = excluded.hifz_to_surah,
      hifz_to_ayah = excluded.hifz_to_ayah,
      hifz_pages_target = excluded.hifz_pages_target,
      review_pages_target = excluded.review_pages_target,
      notes = excluded.notes,
      created_by = excluded.created_by,
      updated_at = now()
    RETURNING student_id
  `;
  return rows.length > 0;
}

/**
 * "نسخ خطة الشهر الماضي للجميع": ينسخ المستهدفين والملاحظة (لا نطاق السورة/الآية،
 * فهو خاص بالشهر السابق) لكل طالب فعّال بلا خطة في شهر الهدف فقط —
 * ON CONFLICT DO NOTHING فلا تُستبدل أي خطة قائمة أبداً. يرجع عدد المنسوخ.
 */
export async function copyPreviousPlans(
  halaqahId: number,
  createdBy: number,
  fromMonth: string,
  toMonth: string,
): Promise<number> {
  const rows = await db().sql`
    INSERT INTO monthly_plans (
      halaqah_id, student_id, month, hifz_pages_target, review_pages_target, notes, created_by, updated_at
    )
    SELECT p.halaqah_id, p.student_id, ${toMonth}::text, p.hifz_pages_target, p.review_pages_target, p.notes,
           ${createdBy}::int, now()
    FROM monthly_plans p
    JOIN students s ON s.teacher_id = p.halaqah_id AND s.id = p.student_id
    WHERE p.halaqah_id = ${halaqahId} AND p.month = ${fromMonth}
      AND s.active AND s.deleted_at IS NULL
    ON CONFLICT (halaqah_id, student_id, month) DO NOTHING
    RETURNING student_id
  `;
  return rows.length;
}

/** خطة طالب واحد لشهر + إنجازه — لبطاقة الطالب وولي الأمر (الهوية تأتي من الجلسة/الربط فقط) */
export async function getStudentPlanView(
  halaqahId: number,
  studentId: string,
  month: string,
  today: string,
): Promise<PlanView> {
  const range = hijriMonthRange(month);
  const [planRows, actuals] = await Promise.all([
    db().sql`
      SELECT student_id, month,
             hifz_from_surah, hifz_from_ayah, hifz_to_surah, hifz_to_ayah,
             hifz_pages_target, review_pages_target, notes
      FROM monthly_plans
      WHERE halaqah_id = ${halaqahId} AND student_id = ${studentId} AND month = ${month}
    `,
    getMonthActuals(halaqahId, range.start, range.end, studentId),
  ]);
  const stored = planRows[0] ? rowToPlan(planRows[0]) : null;
  const plan: PlanTargets | null = stored
    ? {
        hifzPagesTarget: stored.hifzPagesTarget,
        reviewPagesTarget: stored.reviewPagesTarget,
        hifz: stored.hifz,
        notes: stored.notes,
      }
    : null;
  const actual = actuals[studentId] ?? EMPTY_ACTUAL;
  return {
    month,
    monthLabel: monthLabel(month),
    start: range.start,
    end: range.end,
    plan,
    actual,
    progress: summarizePlan(plan, actual, range, today),
  };
}
