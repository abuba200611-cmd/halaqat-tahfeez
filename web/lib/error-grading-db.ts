import "server-only";

import { db } from "./db";
import { getMosqueIdForHalaqah } from "./discipline-db";
import { isFeatureEnabled } from "./mosque/db";
import { getMosqueSetting, setMosqueSetting } from "./mosque-settings-db";
import {
  ERROR_GRADING_FEATURE_KEY,
  ERROR_GRADING_SETTING_KEY,
  mergeErrorGradingConfig,
  type ErrorCounts,
  type ErrorGradingConfig,
} from "./error-grading";

/*
  الوصول لتقييم الورد بنقاط الأخطاء. halaqahId يطابق ward_logs.teacher_id
  (الحلقة) ويأتي من جلسة المعلّم فقط — لا استعلام هنا يقبل معرّف حلقة من العميل.
*/

/** الإعدادات الفعّالة للجامع: المخزون إن صلح وإلا الافتراضيات (لا ترمي أبداً) */
export async function getErrorGradingConfig(mosqueId: number): Promise<ErrorGradingConfig> {
  return mergeErrorGradingConfig(await getMosqueSetting(mosqueId, ERROR_GRADING_SETTING_KEY));
}

export async function setErrorGradingConfig(mosqueId: number, config: ErrorGradingConfig): Promise<void> {
  await setMosqueSetting(mosqueId, ERROR_GRADING_SETTING_KEY, config);
}

export type ErrorGradingContext = { mosqueId: number; config: ErrorGradingConfig };

/** سياق التقييم لحلقة: الجامع مربوط والميزة مفعّلة له. null = الميزة غير متاحة (التقييم القائم يعمل كما هو) */
export async function errorGradingContextForHalaqah(halaqahId: number): Promise<ErrorGradingContext | null> {
  const mosqueId = await getMosqueIdForHalaqah(halaqahId);
  if (mosqueId === null) return null;
  if (!(await isFeatureEnabled(mosqueId, ERROR_GRADING_FEATURE_KEY))) return null;
  return { mosqueId, config: await getErrorGradingConfig(mosqueId) };
}

/**
 * يحفظ تقييم ورد. شرط الحلقة داخل الاستعلام نفسه — ورد حلقة أخرى يرجع null
 * بلا أي كتابة (لا IDOR). الدرجة والتقدير محسوبان بالخادم قبل الاستدعاء.
 */
export async function saveWardErrorGrade(
  halaqahId: number,
  wardId: number,
  counts: ErrorCounts,
  score: number,
  band: string,
): Promise<{ studentId: string } | null> {
  const rows = await db().sql`
    UPDATE ward_logs
    SET error_counts = ${JSON.stringify(counts)}::jsonb, error_score = ${score}, error_band = ${band}
    WHERE teacher_id = ${halaqahId} AND id = ${wardId}
    RETURNING student_id
  `;
  return rows.length > 0 ? { studentId: rows[0].student_id as string } : null;
}
