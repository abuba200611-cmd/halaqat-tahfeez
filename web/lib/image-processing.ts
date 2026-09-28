import "server-only";

import sharp from "sharp";

/*
  معالجة صور مرفقات البلاغات (STEP 55ب) — يقبل JPEG/PNG/WebP فقط
  (تحقّق بالـmagic bytes الفعلية، لا بامتداد الملف ولا mimetype الذي
  يرسله المتصفّح — كلاهما غير موثوق)، ويعيد ترميزها WebP على الخادم:
  تصغير لأقصى ١٦٠٠ بكسل لأطول ضلع، جودة ٨٠، وبلا أي metadata (sharp لا
  يحتفظ بها إلا عند استدعاء withMetadata() صراحة — لم نستدعها هنا).
*/

const MAX_DIMENSION = 1600;
const WEBP_QUALITY = 80;

export const MAX_ATTACHMENTS_PER_SUGGESTION = 3;
/** حجم الملف الخام قبل المعالجة — حد أولي رخيص لمنع رفع ملفات ضخمة قبل حتى قراءتها */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** حجم الناتج بعد إعادة الترميز — يطابق قيد size_bytes بقاعدة البيانات */
export const MAX_PROCESSED_BYTES = 1024 * 1024;

export type DetectedImageType = "image/jpeg" | "image/png" | "image/webp";

/**
 * يتحقّق من نوع الصورة الفعلي عبر البايتات الأولى (magic bytes) — يرفض
 * أي شيء آخر عمداً حتى لو كان امتداده أو mimetype المُرسَل صورة صحيحة
 * (SVG، GIF، HEIC، أو ملف نصي بامتداد .png). SVG بالذات خطر حقيقي (قد
 * يحمل سكربتاً)، لذا الرفض هنا صريح لا مجرد "لم يُتعرَّف عليه".
 */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
}

export type ProcessedImage = {
  bytes: Buffer;
  mime: "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
};

/**
 * يستخرج ملفات صور من FormData (مفتاح fieldName، متكرر) ويعيد ترميزها
 * كلها — يرمي فوراً لو تجاوز عددها MAX_ATTACHMENTS_PER_SUGGESTION، أو
 * لو فشلت أي صورة (لا نُدرج البلاغ بمرفقات جزئية أبداً؛ الترانزاكشن
 * بـlib/db.ts يعتمد على هذا: كل الصور تصل جاهزة قبل أي INSERT).
 */
export async function readAndProcessAttachments(formData: FormData, fieldName: string): Promise<ProcessedImage[]> {
  const files = formData.getAll(fieldName).filter((v): v is File => v instanceof File && v.size > 0);
  if (files.length > MAX_ATTACHMENTS_PER_SUGGESTION) {
    throw new Error(`أقصى عدد صور هو ${MAX_ATTACHMENTS_PER_SUGGESTION}`);
  }
  const results: ProcessedImage[] = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    results.push(await processSuggestionImage(buffer));
  }
  return results;
}

/** يرمي برسالة عربية واضحة عند رفض الصيغة أو تجاوز الحجم بعد المعالجة */
export async function processSuggestionImage(buffer: Buffer): Promise<ProcessedImage> {
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error("حجم الصورة أكبر من 5 ميغابايت");
  }
  if (!detectImageType(buffer)) {
    throw new Error("صيغة الصورة غير مدعومة — JPEG أو PNG أو WebP فقط");
  }

  let data: Buffer;
  let info: { width: number; height: number };
  try {
    const result = await sharp(buffer)
      .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    data = result.data;
    info = result.info;
  } catch {
    throw new Error("تعذّرت معالجة الصورة — جرّب ملفاً آخر");
  }

  if (data.length > MAX_PROCESSED_BYTES) {
    throw new Error("الصورة كبيرة حتى بعد الضغط — جرّب صورة أخرى");
  }

  return { bytes: data, mime: "image/webp", sizeBytes: data.length, width: info.width, height: info.height };
}
