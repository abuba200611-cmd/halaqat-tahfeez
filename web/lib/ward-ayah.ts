/*
  التحقّق من نطاق سورة/آية لنموذج ورد الطالب (STEP 49) — دالة واحدة
  مشتركة يستوردها كل من مسار API (مصدر الحقيقة، app/api/wards/route.ts)
  ونموذج الطالب بالواجهة (تعطيل زر الإرسال + رسالة فورية قبل أي طلب
  شبكة)، فلا تتكرر قواعد التحقق بمكانين وتبقى الرسائل متطابقة حرفياً.
*/
import { globalAyahOrder, isValidSurah, pageRangeOfAyahRange, surahAyahCount, surahName } from "./quran-surahs";
import type { AyahRange, PageRange } from "./types";

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
