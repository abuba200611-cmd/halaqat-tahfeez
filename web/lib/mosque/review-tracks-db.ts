import "server-only";

import { db } from "@/lib/db";
import { getMosqueIdForHalaqah } from "@/lib/discipline-db";
import {
  DEFAULT_REVIEW_TRACK_CONFIG,
  REVIEW_TRACK_FEATURE_KEY,
  parseReviewTrackConfig,
  type ReviewTrackConfig,
  type ReviewTrackSettings,
} from "@/lib/review-track-config";
import { isFeatureEnabled } from "./db";

/*
  إعدادات تصنيف المراجعة لكل جامع — طبقة وصول فوق قاعدة الحلقات الموحّدة
  (نفس موصّل @/lib/db ونمط lib/mosque/exams-db.ts). الضبط الرقمي في config
  ميزة "review_tracks" بجدول mosque_features القائم (JSONB)، والتفعيل عمود
  enabled بالميزة نفسها (آلية التبديل العامة للبطاقات) — لا تكرار للحالة
  في مكانين. حلقة بلا جامع = الافتراضيات.
*/

// ————— الإعدادات (config ميزة review_tracks) —————

/** الإعدادات الفعّالة للجامع: الضبط المخزَّن مُصحَّحاً + التفعيل من عمود الميزة */
export async function getReviewTrackConfig(mosqueId: number): Promise<ReviewTrackConfig> {
  const rows = await db().sql`
    SELECT config FROM mosque_features WHERE mosque_id = ${mosqueId} AND feature_key = ${REVIEW_TRACK_FEATURE_KEY}
  `;
  return {
    ...parseReviewTrackConfig(rows[0]?.config),
    enabled: await isFeatureEnabled(mosqueId, REVIEW_TRACK_FEATURE_KEY),
  };
}

/**
 * يكتب ضبط الميزة — ON CONFLICT يحدّث config وحده فلا يغيّر تفعيل الميزة.
 * الصف الأول يُدرج enabled=true (افتراض السجل) فلا يقلب حفظُ الضبط تعطيلاً.
 * الضبط كائن كامل مُصحَّح قبل الوصول هنا (validateReviewTrackSettings)،
 * فلا يبقى بالمخزَّن مفتاح enabled دخيل ولا قيمة غير صالحة.
 */
export async function updateReviewTrackConfig(mosqueId: number, settings: ReviewTrackSettings): Promise<ReviewTrackSettings> {
  await db().sql`
    INSERT INTO mosque_features (mosque_id, feature_key, enabled, config)
    VALUES (${mosqueId}, ${REVIEW_TRACK_FEATURE_KEY}, true, ${JSON.stringify(settings)}::jsonb)
    ON CONFLICT (mosque_id, feature_key) DO UPDATE SET config = excluded.config, updated_at = now()
  `;
  return settings;
}

// ————— الحل فيها لكل حلقة —————

/**
 * الإعدادات كما تراها حلقة: جامعها المربوط إن فُعلت له الميزة، وإلا
 * الافتراضيات. حلقة مستقلة بلا جامع = الافتراضيات دائماً. التعطيل يُرجع
 * enabled=false مع إبقاء بقية الضبط — القيم المخزَّنة للأوراد لا تُمس.
 */
export async function reviewTrackConfigForHalaqah(halaqahId: number): Promise<ReviewTrackConfig> {
  const mosqueId = await getMosqueIdForHalaqah(halaqahId);
  if (mosqueId === null) return DEFAULT_REVIEW_TRACK_CONFIG;
  return getReviewTrackConfig(mosqueId);
}
