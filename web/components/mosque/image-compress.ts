import { MAX_PHOTO_SIDE, TARGET_PHOTO_BYTES } from "@/lib/mosque/archive";

/*
  ضغط الصورة داخل المتصفح قبل الرفع: تصغير لأطول ضلع 1600px ثم JPEG بجودة
  ~0.8، وإن زاد عن 400KB نخفض الجودة ثم الأبعاد تدريجياً. القاعدة المجانية
  صغيرة، فلا تُرفع الصورة الأصلية أبداً.
*/

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("الملف ليس صورة");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("تعذّر قراءة الصورة");
  }

  try {
    let scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    let quality = 0.8;
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("المتصفح لا يدعم ضغط الصور");
      ctx.fillStyle = "#ffffff"; // JPEG بلا شفافية
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await toBlob(canvas, quality);
      if (!blob) throw new Error("تعذّر ضغط الصورة");
      if (blob.size <= TARGET_PHOTO_BYTES) return blob;

      if (quality > 0.55) quality -= 0.1;
      else scale *= 0.85;
    }
    throw new Error("الصورة كبيرة جداً حتى بعد الضغط");
  } finally {
    bitmap.close();
  }
}
