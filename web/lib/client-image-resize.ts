/*
  تصغير الصورة داخل المتصفح قبل الرفع (STEP 55، تعديل ما بعد المراجعة) —
  حد Vercel 4.5MB لكامل الطلب يُطبَّق قبل وصوله للكود إطلاقاً، فالاعتماد
  على sharp بالخادم وحده (بعد وصول الطلب) لا يكفي لملفات كبيرة. sharp
  يبقى المرجع النهائي (magic bytes، حذف metadata، ضمان الحجم ≤1MB) — هذا
  مجرّد تصغير أولي على العميل ليصل الطلب أصلاً تحت حد Vercel.
*/

export const CLIENT_MAX_DIMENSION = 1600;
export const CLIENT_WEBP_QUALITY = 0.8;

/** يحسب أبعاداً مصغّرة تحافظ على النسبة، بلا تكبير — صرفة وقابلة للاختبار بمعزل عن canvas الحقيقي */
export function computeScaledDimensions(
  width: number,
  height: number,
  maxDimension: number = CLIENT_MAX_DIMENSION,
): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** يصغّر ملف صورة عبر canvas إلى WebP (أو JPEG لو WebP غير مدعوم بالمتصفح) — يعمل بالمتصفح فقط، لا Node */
export async function resizeImageForUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = computeScaledDimensions(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("تعذّرت معالجة الصورة في المتصفح");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const webp = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", CLIENT_WEBP_QUALITY),
    );
    const blob =
      webp && webp.type === "image/webp"
        ? webp
        : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", CLIENT_WEBP_QUALITY));
    if (!blob) throw new Error("تعذّرت معالجة الصورة في المتصفح");

    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.${ext}`, { type: blob.type });
  } finally {
    bitmap.close();
  }
}
