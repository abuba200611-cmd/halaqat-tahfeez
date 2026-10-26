/*
  قراءة جسم طلب الورد وبناء NewWardLog (001 T024): الدوال المساعدة التي
  كانت خاصة بمسار الطالب app/api/wards/route.ts — يستعملها مسار الطالب
  ومسار تسجيل المعلّم للابتدائي (POST /api/teacher/wards) معاً، فلا تتكرر
  قواعد التحقق ولا ترتيب الأعمدة بمكانين (الدستور VI: مصدر حقيقة واحد).
*/
import { parseAyahRange, parseReviewSegments, type AyahRangeInput } from "./ward-ayah";
import type { NewReviewSegment, NewWardLog } from "./db";
import type { ReviewTrack } from "./types";

/** يقرأ موضع سورة/آية من الجسم بأمان — null لأي قيمة غير رقمية */
export function readPos(input: unknown): { surah: number | null; ayah: number | null } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const surah = Number(raw.surah);
  const ayah = Number(raw.ayah);
  return {
    surah: Number.isFinite(surah) && raw.surah != null ? surah : null,
    ayah: Number.isFinite(ayah) && raw.ayah != null ? ayah : null,
  };
}

export function readRangeInput(raw: unknown): AyahRangeInput {
  const r = (raw ?? {}) as { from?: unknown; to?: unknown };
  return { from: readPos(r.from), to: readPos(r.to) };
}

/** يقرأ نطاق سورة/آية اختياري (الحفظ) من الجسم ويحوّله لنطاق صفحات — يرمي برسالة دقيقة لو غير صحيح */
export function parseRange(input: unknown, label: string) {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") throw new Error(`أكمل اختيار السورة والآية بقسم ${label}`);
  return parseAyahRange(readRangeInput(input), label);
}

/**
 * يقرأ قائمة مقاطع المراجعة من الجسم (STEP 52: مصفوفة من ١ إلى ١٠
 * مقاطع، كل مقطع {from, to}) ويتحقّق منها عبر parseReviewSegments —
 * نفس مصدر الحقيقة الذي تستخدمه الواجهة للتحقّق الفوري.
 */
export function parseReviewBody(input: unknown): ReturnType<typeof parseReviewSegments> {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) throw new Error("صيغة المراجعة غير صحيحة");
  return parseReviewSegments(input.map(readRangeInput));
}

/** يقرأ معرّف زميل المراجعة الاختياري من الجسم — نص غير فارغ فقط، وإلا null (STEP 56) */
export function readBuddyId(input: unknown): string | null {
  const value = String(input ?? "").trim();
  return value || null;
}

/** يبني NewWardLog من نتيجتَي تحقّق الحفظ والمراجعة — مشترك بين مسارَي الطالب والمعلّم */
export function buildLog(
  date: string,
  hifz: ReturnType<typeof parseAyahRange>,
  review: ReturnType<typeof parseReviewSegments>,
  reviewTracks: (ReviewTrack | null)[] | null,
  note: string,
  buddyStudentId: string | null,
): NewWardLog {
  const reviewSegments: NewReviewSegment[] | null = review
    ? review.segments.map((seg, i) => ({ ...seg, fromPage: review.pages[i].from, toPage: review.pages[i].to }))
    : null;
  const reviewFrom = review ? Math.min(...review.pages.map((p) => p.from)) : null;
  const reviewTo = review ? Math.max(...review.pages.map((p) => p.to)) : null;

  return {
    date,
    hifzFrom: hifz?.pages.from ?? null,
    hifzTo: hifz?.pages.to ?? null,
    reviewFrom,
    reviewTo,
    hifzAyah: hifz?.ayah ?? null,
    // STEP 52: المراجعة الجديدة دائماً مقاطع (0 أو أكثر)، لا نطاق واحد قديم
    reviewAyah: null,
    reviewSegments,
    // B3: تصنيف كبرى/صغرى لكل مقطع — اختياري، بلا قيمة لأي ورد قديم
    reviewSegmentTracks: reviewTracks ?? undefined,
    note,
    buddyStudentId,
  };
}
