import { describe, expect, it } from "vitest";
import { FEATURES } from "../lib/mosque/features";
import { TOUR_GROUPS } from "../components/landing/tour";

/*
  جولة المنتج في /welcome يجب أن تذكر كل ميزة «جاهزة» من سجل المزايا —
  إضافة ميزة للسجل بلا إضافتها للجولة تُفشل هذا الاختبار فلا تسقط ميزة
  من صفحة التعريف بالمنصة.
*/

const TOUR_KEYS = new Set(TOUR_GROUPS.flatMap((g) => g.items.map((i) => i.featureKey).filter(Boolean)));

describe("جولة المنتج تغطي سجل المزايا", () => {
  it("كل ميزة من السجل مذكورة مرة واحدة على الأقل", () => {
    for (const feature of FEATURES) {
      expect(TOUR_KEYS.has(feature.key), `الميزة «${feature.nameAr}» (${feature.key}) غير موجودة في جولة /welcome`).toBe(true);
    }
  });

  it("كل جملة في الجولة سطر واحد موجز", () => {
    for (const group of TOUR_GROUPS) {
      for (const item of group.items) {
        expect(item.text.length, `${group.title}/${item.title}`).toBeGreaterThan(10);
        expect(item.text.length, `${group.title}/${item.title}`).toBeLessThan(160);
        expect(item.text.endsWith(".")).toBe(true);
      }
    }
  });
});
