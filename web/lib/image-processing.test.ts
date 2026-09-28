import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  detectImageType,
  isRequestTooLarge,
  MAX_ATTACHMENTS_PER_SUGGESTION,
  MAX_REQUEST_BYTES,
  MAX_UPLOAD_BYTES,
  processSuggestionImage,
  readAndProcessAttachments,
} from "./image-processing";

async function makePng(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 12, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .png()
    .toBuffer();
}

async function makeJpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 20, height: 12, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .withMetadata({ exif: { IFD0: { Make: "TestCam" } } })
    .jpeg()
    .toBuffer();
}

const SVG_BUFFER = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const GIF_BUFFER = Buffer.from("GIF89a" + "\x00".repeat(20));
const PLAIN_TEXT_BUFFER = Buffer.from("this is not an image, just text pretending to be a .png");

describe("detectImageType (STEP 55ب)", () => {
  it("يتعرّف على JPEG وPNG وWebP عبر magic bytes فقط", async () => {
    const png = await makePng();
    const jpeg = await makeJpegWithExif();
    const webp = await sharp(png).webp().toBuffer();

    expect(detectImageType(jpeg)).toBe("image/jpeg");
    expect(detectImageType(png)).toBe("image/png");
    expect(detectImageType(webp)).toBe("image/webp");
  });

  it("يرفض SVG وGIF ونصاً عادياً بامتداد مزيّف", () => {
    expect(detectImageType(SVG_BUFFER)).toBeNull();
    expect(detectImageType(GIF_BUFFER)).toBeNull();
    expect(detectImageType(PLAIN_TEXT_BUFFER)).toBeNull();
  });
});

describe("processSuggestionImage (STEP 55ب)", () => {
  it("يرفض ملفاً نصياً بامتداد .png مزيّف", async () => {
    await expect(processSuggestionImage(PLAIN_TEXT_BUFFER)).rejects.toThrow("صيغة الصورة غير مدعومة");
  });

  it("يرفض SVG", async () => {
    await expect(processSuggestionImage(SVG_BUFFER)).rejects.toThrow("صيغة الصورة غير مدعومة");
  });

  it("يرفض ملفاً أكبر من 5 ميغابايت حتى لو بدايته JPEG صحيحة", async () => {
    const oversized = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_UPLOAD_BYTES)]);
    await expect(processSuggestionImage(oversized)).rejects.toThrow("5 ميغابايت");
  });

  it("ينتج WebP صحيحاً بدون أي EXIF حتى لو كان بالأصل موجوداً بالصورة المصدر", async () => {
    const jpegWithExif = await makeJpegWithExif();
    expect((await sharp(jpegWithExif).metadata()).exif).toBeDefined();

    const result = await processSuggestionImage(jpegWithExif);
    expect(result.mime).toBe("image/webp");
    expect(detectImageType(result.bytes)).toBe("image/webp");

    const outputMeta = await sharp(result.bytes).metadata();
    expect(outputMeta.exif).toBeUndefined();
  });

  it("يصغّر الصورة لأقصى 1600 بكسل لأطول ضلع", async () => {
    const big = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .png()
      .toBuffer();
    const result = await processSuggestionImage(big);
    expect(result.width).toBeLessThanOrEqual(1600);
    expect(result.height).toBeLessThanOrEqual(1600);
  });
});

describe("readAndProcessAttachments (STEP 55ب)", () => {
  it(`يرفض أكثر من ${MAX_ATTACHMENTS_PER_SUGGESTION} صور دفعة واحدة`, async () => {
    const form = new FormData();
    // بيانات وهمية تكفي لاختبار حد العدد — الفحص يحدث قبل قراءة أي محتوى فعلي
    for (let i = 0; i < MAX_ATTACHMENTS_PER_SUGGESTION + 1; i++) {
      form.append("images", new File([new Uint8Array([1, 2, 3])], `${i}.png`, { type: "image/png" }));
    }
    await expect(readAndProcessAttachments(form, "images")).rejects.toThrow(
      `أقصى عدد صور هو ${MAX_ATTACHMENTS_PER_SUGGESTION}`,
    );
  });

  it("يقبل بالضبط الحد الأقصى ويعالج كل صورة", async () => {
    const png = await makePng();
    const form = new FormData();
    for (let i = 0; i < MAX_ATTACHMENTS_PER_SUGGESTION; i++) {
      form.append("images", new File([new Uint8Array(png)], `${i}.png`, { type: "image/png" }));
    }
    const results = await readAndProcessAttachments(form, "images");
    expect(results.length).toBe(MAX_ATTACHMENTS_PER_SUGGESTION);
    results.forEach((r) => expect(r.mime).toBe("image/webp"));
  });
});

/*
  حد Vercel 4.5MB (STEP 55 — تعديل ما بعد المراجعة): "٣ صور كبيرة (٥
  ميغابايت لكل واحدة قبل التصغير) تُرفَع بنجاح بطلب أقل من ٤ ميغابايت"
  يعني عملياً: بعد تصغير المتصفح (lib/client-image-resize.ts، غير قابل
  للاختبار هنا لاعتماده على canvas/createImageBitmap الحقيقيين — بيئة
  متصفح لا Vitest node)، الطلب الواصل فعلياً يكون أقل من ٤MB فيمرّ هذا
  الفحص، بينما طلب لم يُصغَّر (أو صُغِّر بشكل غير كافٍ) يُرفض برسالة
  عربية واضحة قبل حتى قراءة الجسم.
*/
describe("isRequestTooLarge (STEP 55 — حد 4MB لجسم الطلب)", () => {
  function reqWithLength(bytes: number | null): Request {
    const headers = new Headers();
    if (bytes !== null) headers.set("content-length", String(bytes));
    return new Request("http://localhost/api/suggestions", { headers });
  }

  it("طلب يحاكي ٣ صور مُصغَّرة (٩٠٠ كيلوبايت لكل واحدة ≈ 2.7MB إجمالاً): يمرّ", () => {
    expect(isRequestTooLarge(reqWithLength(3 * 900 * 1024))).toBe(false);
  });

  it("طلب أكبر من 4 ميغابايت: يُرفض", () => {
    expect(isRequestTooLarge(reqWithLength(MAX_REQUEST_BYTES + 1))).toBe(true);
  });

  it("طلب بالضبط عند الحد: يمرّ (الرفض عند التجاوز لا عند المساواة)", () => {
    expect(isRequestTooLarge(reqWithLength(MAX_REQUEST_BYTES))).toBe(false);
  });

  it("بلا ترويسة Content-Length إطلاقاً: يمرّ (لا دليل على تجاوزه)", () => {
    expect(isRequestTooLarge(reqWithLength(null))).toBe(false);
  });
});
