import "server-only";

import { db } from "./db";
import { parseStage, type HalaqahStage } from "./halaqah-stage";

/*
  فئة الحلقة بطبقة القاعدة (001 US1): عمود halaqahs.stage (مايقريشن M1 —
  لا يُستعمل إلا بعد تطبيقها من المالك). قراءة وتحديث بلا أي منطق
  صلاحيات هنا: المسارات تتحقق من الدور (مشرف الحلقة/مدير الجامع) وتسجّل
  حدث الأمان halaqah.stage_change. NULL = الحلقة على النمط الحالي (legacy).
*/

/**
 * فئة الحلقة كما خُزِّنت — null للحلقة بلا فئة أو غير الموجودة (المستدعي
 * الذي يميّز بينهما يفحص وجود الحلقة بنفسه).
 */
export async function getHalaqahStage(halaqahId: number): Promise<HalaqahStage | null> {
  const rows = await db().sql`SELECT stage FROM halaqahs WHERE id = ${halaqahId}`;
  return parseStage(rows[0]?.stage);
}

/**
 * يحدّث فئة الحلقة — false لو الحلقة غير موجودة. stage=null يعيدها
 * للنمط الافتراضي. التحقق من القيمة (parseStage) مسؤولية المستدعي قبل
 * الوصول هنا.
 */
export async function setHalaqahStage(halaqahId: number, stage: HalaqahStage | null): Promise<boolean> {
  const rows = await db().sql`
    UPDATE halaqahs SET stage = ${stage} WHERE id = ${halaqahId} RETURNING id
  `;
  return rows.length > 0;
}

/**
 * فئة حلقة طالب بعينه (halaqahId = students.teacher_id) — للواجهات التي
 * تقرر بوحدة العرض قبل تحميل الأوراد. null لو الطالب غير موجود بمثل
 * هذه الحلقة أو محذوف.
 */
export async function getStageForStudent(halaqahId: number, studentId: string): Promise<HalaqahStage | null> {
  const rows = await db().sql`
    SELECT h.stage FROM halaqahs h
    JOIN students s ON s.teacher_id = h.id
    WHERE h.id = ${halaqahId} AND s.id = ${studentId} AND s.deleted_at IS NULL
  `;
  return parseStage(rows[0]?.stage);
}
