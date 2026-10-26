/*
  إعدادات تصنيف المراجعة (الكبرى/الصغرى) لكل جامع — وحدة نقية بلا قاعدة
  بيانات ولا "server-only" (نمط lib/mosque/exams.ts). التفعيل عمود enabled
  بميزة "review_tracks" بجدول mosque_features القائم (السجل defaultEnabled
  = true فغياب الصف = مفعّل)، وkubraPages/naming في config الميزة نفسها
  (JSONB). القيم المخزَّنة للمسارات كما كانت: "sabqi" و"manzil" — التسمية
  المبدَّلة تبدّل أسماء العرض فقط.
*/

import type { ReviewTrack } from "./types";

/** مفتاح الميزة بسجل المزايا — التفعيل/التعطيل عبره لا عبر config */
export const REVIEW_TRACK_FEATURE_KEY = "review_tracks";

export type ReviewTrackNaming = "standard" | "swapped";

/** ما يُخزَّن فعلياً في config الميزة — التفعيل عمود مستقل */
export type ReviewTrackSettings = {
  kubraPages: number;
  naming: ReviewTrackNaming;
};

/** الإعدادات الفعّالة كما تراها الحلقة: التفعيل + الضبط */
export type ReviewTrackConfig = ReviewTrackSettings & { enabled: boolean };

export const KUBRA_PAGES_MIN = 1;
export const KUBRA_PAGES_MAX = 60;

export const DEFAULT_REVIEW_TRACK_CONFIG: ReviewTrackConfig = {
  enabled: true,
  kubraPages: 10,
  naming: "standard",
};

/**
 * أسماء العرض لقيمتي المسار بحسب التسمية: القياسية «sabqi»=الكبرى
 * و«manzil»=الصغرى، والمبدَّلة عكسها (بعض الحلقات تسمّي المجاورة للحفظ
 * الصغرى). القيم والاقتراح لا يتغيّران — الأسماء فقط.
 */
export function reviewTrackLabels(naming: ReviewTrackNaming): Record<ReviewTrack, string> {
  return naming === "swapped" ? { sabqi: "الصغرى", manzil: "الكبرى" } : { sabqi: "الكبرى", manzil: "الصغرى" };
}

function intIn(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

/**
 * إعدادات مُصحَّحة من JSON مخزَّن: القيم الغائبة/غير الصالحة تسقط على
 * الافتراضي فلا يكسر JSON يدوي معدَّل المسارات أبداً (لا ترمي إطلاقاً).
 */
export function parseReviewTrackConfig(raw: unknown): ReviewTrackConfig {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : DEFAULT_REVIEW_TRACK_CONFIG.enabled,
    kubraPages: intIn(source.kubraPages, DEFAULT_REVIEW_TRACK_CONFIG.kubraPages, KUBRA_PAGES_MIN, KUBRA_PAGES_MAX),
    naming: source.naming === "swapped" ? "swapped" : "standard",
  };
}

/**
 * ضبط يأتي من واجهة الإدارة: يقبل kubraPages وnaming فقط بقيم صالحة
 * كاملة (لا تصحيح صامت) — أو رسالة خطأ عربية.
 */
export function validateReviewTrackSettings(
  input: unknown,
): { ok: true; value: ReviewTrackSettings } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "صيغة إعدادات تصنيف المراجعة غير صحيحة" };
  }
  const source = input as Record<string, unknown>;
  const kubraPages = source.kubraPages;
  if (
    typeof kubraPages !== "number" ||
    !Number.isInteger(kubraPages) ||
    kubraPages < KUBRA_PAGES_MIN ||
    kubraPages > KUBRA_PAGES_MAX
  ) {
    return { ok: false, error: `عدد صفحات المراجعة المجاورة يجب أن يكون بين ${KUBRA_PAGES_MIN} و${KUBRA_PAGES_MAX}` };
  }
  if (source.naming !== "standard" && source.naming !== "swapped") {
    return { ok: false, error: "تسمية المراجعة غير صحيحة" };
  }
  return { ok: true, value: { kubraPages, naming: source.naming } };
}

/** شرح المصطلحات بأسماء الجامع وعدد صفحاته — مشترك بين نصوص المساعدة كلها */
export function reviewTrackTermsText(settings: ReviewTrackSettings): string {
  const labels = reviewTrackLabels(settings.naming);
  return `«${labels.sabqi}» المراجعة بعد الحفظ الجديد مباشرة (${settings.kubraPages} صفحات)، و«${labels.manzil}» ما بعد ${labels.sabqi} من المحفوظ`;
}
