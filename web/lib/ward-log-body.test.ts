import { describe, expect, it } from "vitest";
import { buildLog, parseRange, parseReviewBody, readBuddyId } from "./ward-log-body";

/*
  001 T024 — قراءة جسم طلب الورد وبناء NewWardLog: الدوال المشتركة بين
  مسار الطالب (POST/PUT /api/wards) ومسار تسجيل المعلّم للابتدائي
  (POST /api/teacher/wards) — تُختبر هنا مرة واحدة نيابة عن المسارين.
*/

describe("parseRange — نطاق سورة/آية اختياري من الجسم", () => {
  it("null/غير موجود ⇒ null (قسم فارغ)", () => {
    expect(parseRange(null, "الحفظ")).toBeNull();
    expect(parseRange(undefined, "الحفظ")).toBeNull();
  });

  it("نطاق صحيح ⇒ آيات + صفحات محسوبة", () => {
    const parsed = parseRange({ from: { surah: 105, ayah: 1 }, to: { surah: 105, ayah: 5 } }, "الحفظ");
    expect(parsed).not.toBeNull();
    expect(parsed!.ayah).toEqual({ fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 });
    expect(parsed!.pages.from).toBeLessThanOrEqual(parsed!.pages.to);
  });

  it("نصف مكتمل أو آية فوق عدد آيات السورة ⇒ خطأ عربي دقيق", () => {
    expect(() => parseRange({ from: { surah: 105, ayah: 1 } }, "الحفظ")).toThrow(
      "أكمل اختيار السورة والآية بقسم الحفظ",
    );
    expect(() => parseRange({ from: { surah: 105, ayah: 1 }, to: { surah: 105, ayah: 99 } }, "الحفظ")).toThrow(
      "سورة الفيل فيها 5 آية",
    );
  });
});

describe("parseReviewBody — مقاطع مراجعة اختيارية", () => {
  it("null أو مصفوفة فارغة ⇒ null", () => {
    expect(parseReviewBody(null)).toBeNull();
    expect(parseReviewBody(undefined)).toBeNull();
  });

  it("ليست مصفوفة ⇒ خطأ", () => {
    expect(() => parseReviewBody({ from: 1 })).toThrow("صيغة المراجعة غير صحيحة");
  });

  it("مقطع صحيح ⇒ صفحات كل مقطع ومجموعها", () => {
    const parsed = parseReviewBody([{ from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } }]);
    expect(parsed!.segments).toHaveLength(1);
    expect(parsed!.pages).toHaveLength(1);
    expect(parsed!.pagesTotal).toBeGreaterThan(0);
  });
});

describe("readBuddyId — زميل اختياري نص غير فارغ", () => {
  it("فارغ أو فراغات ⇒ null، وما عداه ⇒ النص كما هو", () => {
    expect(readBuddyId(undefined)).toBeNull();
    expect(readBuddyId("  ")).toBeNull();
    expect(readBuddyId("s2")).toBe("s2");
  });
});

describe("buildLog — بناء NewWardLog من نتيجتَي التحقق", () => {
  it("حفظ ومراجعة ⇒ الأعمدة والمقاطع محاذية بصفحاتها، وreviewAyah يبقى null", () => {
    const hifz = parseRange({ from: { surah: 105, ayah: 1 }, to: { surah: 105, ayah: 5 } }, "الحفظ");
    const review = parseReviewBody([{ from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } }]);
    const log = buildLog("2026-10-26", hifz, review, null, "ما شاء الله", "s2");
    expect(log.date).toBe("2026-10-26");
    expect(log.hifzFrom).toBe(hifz!.pages.from);
    expect(log.hifzTo).toBe(hifz!.pages.to);
    expect(log.hifzAyah).toEqual(hifz!.ayah);
    expect(log.reviewSegments).toHaveLength(1);
    expect(log.reviewSegments![0].fromPage).toBe(review!.pages[0].from);
    expect(log.reviewFrom).toBe(review!.pages[0].from);
    expect(log.reviewTo).toBe(review!.pages[0].to);
    expect(log.reviewAyah).toBeNull();
    expect(log.note).toBe("ما شاء الله");
    expect(log.buddyStudentId).toBe("s2");
  });

  it("بلا حفظ ولا مراجعة ⇒ أعمدة فارغة ولا مقاطع", () => {
    const log = buildLog("2026-10-26", null, null, null, "", null);
    expect(log.hifzFrom).toBeNull();
    expect(log.hifzAyah).toBeNull();
    expect(log.reviewSegments).toBeNull();
    expect(log.reviewFrom).toBeNull();
    expect(log.reviewTo).toBeNull();
  });
});
