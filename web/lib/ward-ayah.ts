/*
  التحقّق من نطاق سورة/آية لنموذج ورد الطالب (STEP 49) — دالة واحدة
  مشتركة يستوردها كل من مسار API (مصدر الحقيقة، app/api/wards/route.ts)
  ونموذج الطالب بالواجهة (تعطيل زر الإرسال + رسالة فورية قبل أي طلب
  شبكة)، فلا تتكرر قواعد التحقق بمكانين وتبقى الرسائل متطابقة حرفياً.
*/
import { globalAyahOrder, isValidSurah, pageRangeOfAyahRange, surahAyahCount, surahName } from "./quran-surahs";
import type { AyahRange, PageRange, WardStatus } from "./types";

/**
 * نص عرض نطاق السورة/الآية — "الملك 1–15" لنفس السورة، أو
 * "الفاتحة 1 – البقرة 5" لنطاق يمتد لأكثر من سورة (STEP 49، متطلب ٤:
 * أي مكان يعرض الورد يعرض السورة/الآية بدل الصفحات لمن أُرسل بهما).
 */
export function formatAyahRange(range: AyahRange): string {
  const fromName = surahName(range.fromSurah);
  if (range.fromSurah === range.toSurah) {
    return range.fromAyah === range.toAyah
      ? `${fromName} ${range.fromAyah}`
      : `${fromName} ${range.fromAyah}–${range.toAyah}`;
  }
  return `${fromName} ${range.fromAyah} – ${surahName(range.toSurah)} ${range.toAyah}`;
}

/** موضع سورة/آية كما يصل من نموذج الواجهة — الأرقام null قبل أن يختار الطالب */
export type AyahPosInput = { surah: number | null; ayah: number | null };
export type AyahRangeInput = { from: AyahPosInput; to: AyahPosInput };

export type ParsedAyahRange = { ayah: AyahRange; pages: PageRange };

function isEmptyPos(pos: AyahPosInput | null | undefined): boolean {
  return !pos || (pos.surah == null && pos.ayah == null);
}

/**
 * يتحقّق من نطاق سورة/آية لقسم واحد (الحفظ أو المراجعة) ويحوّله لنطاق
 * صفحات جاهز للتخزين. يرجع null لو القسم فارغاً بالكامل (اختياري تماماً
 * — قد يكون اليوم حفظاً فقط أو مراجعة فقط)، ويرمي خطأ برسالة دقيقة لأي
 * حالة غير صحيحة أخرى.
 */
export function parseAyahRange(input: AyahRangeInput | null | undefined, label: string): ParsedAyahRange | null {
  if (!input || (isEmptyPos(input.from) && isEmptyPos(input.to))) return null;

  const { from, to } = input;
  const fromSurah = from?.surah ?? null;
  const fromAyah = from?.ayah ?? null;
  const toSurah = to?.surah ?? null;
  const toAyah = to?.ayah ?? null;

  if (
    fromSurah == null ||
    fromAyah == null ||
    toSurah == null ||
    toAyah == null ||
    !Number.isInteger(fromSurah) ||
    !Number.isInteger(fromAyah) ||
    !Number.isInteger(toSurah) ||
    !Number.isInteger(toAyah)
  ) {
    throw new Error(`أكمل اختيار السورة والآية بقسم ${label}`);
  }

  if (!isValidSurah(fromSurah) || !isValidSurah(toSurah)) {
    throw new Error(`نطاق ${label} خارج حدود المصحف`);
  }
  if (fromAyah < 1 || toAyah < 1) {
    throw new Error(`أكمل اختيار السورة والآية بقسم ${label}`);
  }
  if (fromAyah > surahAyahCount(fromSurah)) {
    throw new Error(`سورة ${surahName(fromSurah)} فيها ${surahAyahCount(fromSurah)} آية`);
  }
  if (toAyah > surahAyahCount(toSurah)) {
    throw new Error(`سورة ${surahName(toSurah)} فيها ${surahAyahCount(toSurah)} آية`);
  }
  if (globalAyahOrder(toSurah, toAyah) < globalAyahOrder(fromSurah, fromAyah)) {
    throw new Error("نهاية الورد لازم تكون بعد بدايته في ترتيب المصحف");
  }

  const ayah: AyahRange = { fromSurah, fromAyah, toSurah, toAyah };
  const pages = pageRangeOfAyahRange(fromSurah, fromAyah, toSurah, toAyah);
  return { ayah, pages };
}

/* ————— مراجعة بأكثر من مقطع (STEP 52) ————— */

export const MAX_REVIEW_SEGMENTS = 10;

export type ParsedReviewSegments = { segments: AyahRange[]; pages: PageRange[]; pagesTotal: number };

/**
 * يتحقّق من قائمة مقاطع المراجعة (١ إلى ١٠) — كل مقطع بنفس تحقّق
 * parseAyahRange تماماً، مع بادئة "المقطع N:" على أي رسالة خطأ لتحديد
 * المقطع المسبِّب بدقة. يرجع null لو القائمة فارغة تماماً (لا مراجعة
 * اليوم)؛ مقطع مُضاف صراحة لكنه فارغ الحقول يُعامَل كخطأ ("أكمل
 * الاختيار")، لا كإسقاط صامت — الطالب ضغط "+ أضف مقطع" فعلاً.
 */
export function parseReviewSegments(inputs: AyahRangeInput[] | null | undefined): ParsedReviewSegments | null {
  if (!inputs || inputs.length === 0) return null;
  if (inputs.length > MAX_REVIEW_SEGMENTS) {
    throw new Error(`أقصى عدد مقاطع للمراجعة هو ${MAX_REVIEW_SEGMENTS}`);
  }

  const segments: AyahRange[] = [];
  const pages: PageRange[] = [];
  let pagesTotal = 0;

  inputs.forEach((input, i) => {
    let parsed: ParsedAyahRange | null;
    try {
      parsed = parseAyahRange(input, "المراجعة");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "قيمة غير صحيحة";
      throw new Error(`المقطع ${i + 1}: ${msg}`);
    }
    if (!parsed) {
      throw new Error(`المقطع ${i + 1}: أكمل اختيار السورة والآية`);
    }
    segments.push(parsed.ayah);
    pages.push(parsed.pages);
    pagesTotal += parsed.pages.to - parsed.pages.from + 1;
  });

  return { segments, pages, pagesTotal };
}

/** يعرض مقطعاً واحداً — "الملك (كاملة)" لو غطّى السورة من أول آية لآخرها، وإلا "الملك 1–15" العادي */
function formatReviewSegment(range: AyahRange): string {
  if (range.fromSurah === range.toSurah && range.fromAyah === 1 && range.toAyah === surahAyahCount(range.fromSurah)) {
    return `${surahName(range.fromSurah)} (كاملة)`;
  }
  return formatAyahRange(range);
}

/** نص عرض كل مقاطع المراجعة مفصولة بفاصلة — "البقرة 1–20، الملك (كاملة)" */
export function formatReviewSegments(segments: AyahRange[]): string {
  return segments.map(formatReviewSegment).join("، ");
}

/* ————— قفل تعديل الورد بعد قرار المعلّم (STEP 52) ————— */

/**
 * هل يجوز للطالب تعديل/حذف هذا الورد؟ فقط بينما لم يتخذ المعلّم قراراً
 * بعد (new أو seen). بعد الاعتماد أو طلب الإعادة — الورد يُقفَل. يُستخدم
 * هذا الشرط حرفياً داخل جملة SQL نفسها (lib/db.ts) لا كتحقّق منفصل قبلها،
 * ويُعاد استخدامه هنا لعرض/إخفاء أزرار التعديل بالواجهة بنفس المنطق.
 */
export function canEditWard(status: WardStatus): boolean {
  return status === "new" || status === "seen";
}
