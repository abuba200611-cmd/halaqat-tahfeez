import { describe, expect, it } from "vitest";
import { STAGES, STAGE_LABEL_AR, parseStage, profileFor } from "./halaqah-stage";

/*
  001 T004 — ملف نمط الفئة: أربع فئات بقيمها، وملف legacy (العمود NULL)
  يطابق السلوك الحالي حرفياً (SC-005): وحدة آيات/صفحات، المعلّم لا يسجّل
  عن الطالب، والكبرى/الصغرى ظاهرة. الجدول كله حسب data-model §1.
*/

describe("فئة الحلقة — STAGES وparseStage", () => {
  it("STAGES أربع قيم بالترتيب المتفق عليه", () => {
    expect(STAGES).toEqual(["primary", "intermediate", "secondary", "university"]);
  });

  it("parseStage يقبل null (بلا فئة) والقيم الأربع فقط", () => {
    expect(parseStage(null)).toBeNull();
    expect(parseStage(undefined)).toBeNull();
    expect(parseStage("primary")).toBe("primary");
    expect(parseStage("intermediate")).toBe("intermediate");
    expect(parseStage("secondary")).toBe("secondary");
    expect(parseStage("university")).toBe("university");
  });

  it("parseStage يرفض أي قيمة أخرى (المسار يحوّلها إلى 400)", () => {
    expect(() => parseStage("kindergarten")).toThrow();
    expect(() => parseStage("")).toThrow();
    expect(() => parseStage("PRIMARY")).toThrow();
    expect(() => parseStage(3)).toThrow();
    expect(() => parseStage({ stage: "primary" })).toThrow();
  });

  it("STAGE_LABEL_AR أسماء عربية لكل فئة", () => {
    expect(STAGE_LABEL_AR).toEqual({
      primary: "ابتدائي",
      intermediate: "متوسط",
      secondary: "ثانوي",
      university: "جامعي وكبار",
    });
  });
});

describe("فئة الحلقة — ملف كل فئة (data-model §1)", () => {
  it("profileFor(null) = ملف legacy مطابق للسلوك الحالي", () => {
    expect(profileFor(null)).toEqual({
      stage: "legacy",
      labelAr: "افتراضي",
      unit: "ayah_page",
      teacherRecords: false,
      autoApproveOnTeacherRecord: false,
      studentSelfApproval: "manual",
      pointsDefault: false,
      reviewTracksDefault: true,
      queueDefault: false,
    });
    // undefined (العمود غائب بجسم طلب أو صف قديم) = نفس ملف legacy
    expect(profileFor(undefined)).toEqual(profileFor(null));
  });

  it("primary: سور وآيات، المعلّم يسجّل معتمداً، نجوم بلا كبرى/صغرى ولا طابور", () => {
    expect(profileFor("primary")).toEqual({
      stage: "primary",
      labelAr: "ابتدائي",
      unit: "surah_ayah",
      teacherRecords: true,
      autoApproveOnTeacherRecord: true,
      studentSelfApproval: "manual",
      pointsDefault: true,
      reviewTracksDefault: false,
      queueDefault: false,
    });
  });

  it("intermediate: آيات وصفحات، اعتماد يدوي، بلا نجوم ولا طابور", () => {
    expect(profileFor("intermediate")).toEqual({
      stage: "intermediate",
      labelAr: "متوسط",
      unit: "ayah_page",
      teacherRecords: false,
      autoApproveOnTeacherRecord: false,
      studentSelfApproval: "manual",
      pointsDefault: false,
      reviewTracksDefault: true,
      queueDefault: false,
    });
  });

  it("secondary: صفحات وأوجه، اعتماد يدوي، بلا نجوم ولا طابور", () => {
    expect(profileFor("secondary")).toEqual({
      stage: "secondary",
      labelAr: "ثانوي",
      unit: "page_wajh",
      teacherRecords: false,
      autoApproveOnTeacherRecord: false,
      studentSelfApproval: "manual",
      pointsDefault: false,
      reviewTracksDefault: true,
      queueDefault: false,
    });
  });

  it("university: أوجه وأجزاء، اعتماد عبر الطابور، واليدوي متاح", () => {
    expect(profileFor("university")).toEqual({
      stage: "university",
      labelAr: "جامعي وكبار",
      unit: "wajh_juz",
      teacherRecords: false,
      autoApproveOnTeacherRecord: false,
      studentSelfApproval: "queue",
      pointsDefault: false,
      reviewTracksDefault: true,
      queueDefault: true,
    });
  });
});
