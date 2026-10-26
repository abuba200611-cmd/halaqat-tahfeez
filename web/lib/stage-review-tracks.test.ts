import { describe, expect, it } from "vitest";
import { reviewTracksVisible } from "./stage-review-tracks";
import { profileFor, type HalaqahStage } from "./halaqah-stage";

/*
  001 T012 — الكبرى/الصغرى حسب الفئة (FR-011): إعداد الجامع يتقدّم —
  جامع معطّل يخفيها لكل الفئات؛ جامع مفعّل يتبع ملف الفئة (الابتدائي
  مخفي افتراضاً)؛ حلقة مستقلة بلا جامع تتبع افتراض الفئة كما اليوم.
*/

const ALL_STAGES: (HalaqahStage | null)[] = ["primary", "intermediate", "secondary", "university", null];

describe("reviewTracksVisible — مصفوفة الفئة × إعداد الجامع", () => {
  it("جامع معطّل ⇒ مخفية مهما كانت الفئة", () => {
    for (const stage of ALL_STAGES) {
      expect(reviewTracksVisible(profileFor(stage), false)).toBe(false);
    }
  });

  it("جامع مفعّل + ابتدائي ⇒ مخفية، والباقي ظاهرة", () => {
    expect(reviewTracksVisible(profileFor("primary"), true)).toBe(false);
    expect(reviewTracksVisible(profileFor("intermediate"), true)).toBe(true);
    expect(reviewTracksVisible(profileFor("secondary"), true)).toBe(true);
    expect(reviewTracksVisible(profileFor("university"), true)).toBe(true);
    // legacy = السلوك الحالي: ظاهرة
    expect(reviewTracksVisible(profileFor(null), true)).toBe(true);
  });

  it("بلا جامع (حلقة مستقلة) ⇒ افتراضيات الفئة نفسها", () => {
    expect(reviewTracksVisible(profileFor("primary"), null)).toBe(false);
    expect(reviewTracksVisible(profileFor("secondary"), null)).toBe(true);
    expect(reviewTracksVisible(profileFor(null), null)).toBe(true);
  });
});
