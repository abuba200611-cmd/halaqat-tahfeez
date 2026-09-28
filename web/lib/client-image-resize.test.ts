import { describe, expect, it } from "vitest";
import { computeScaledDimensions } from "./client-image-resize";

/*
  الجزء الوحيد القابل للاختبار بمعزل عن canvas/createImageBitmap
  الحقيقيين (متصفح فقط، غير متاحين في Vitest بيئة node) — حساب الأبعاد
  المصغّرة نفسه صرف وبلا أي DOM. resizeImageForUpload الكامل (canvas
  الفعلي، ترميز WebP) يحتاج بيئة متصفح حقيقية للتحقق منه.
*/
describe("computeScaledDimensions (STEP 55 — تصغير العميل)", () => {
  it("لا يكبّر صورة أصغر من الحد الأقصى", () => {
    expect(computeScaledDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it("يصغّر أطول ضلع لأقصى 1600 مع الحفاظ على النسبة", () => {
    expect(computeScaledDimensions(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(computeScaledDimensions(1600, 3200, 1600)).toEqual({ width: 800, height: 1600 });
  });

  it("صورة مربّعة أكبر من الحد تصير مربّعة بالحد نفسه بالضبط", () => {
    expect(computeScaledDimensions(4000, 4000, 1600)).toEqual({ width: 1600, height: 1600 });
  });
});
