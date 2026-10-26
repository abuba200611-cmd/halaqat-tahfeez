import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_TRACK_CONFIG,
  KUBRA_PAGES_MAX,
  KUBRA_PAGES_MIN,
  parseReviewTrackConfig,
  reviewTrackLabels,
  reviewTrackTermsText,
  validateReviewTrackSettings,
} from "./review-track-config";
import type { WardLog } from "./types";
import { reviewTextWithTracks } from "./review-tracks";

describe("parseReviewTrackConfig — الافتراضيات والتصحيح بلا رمي", () => {
  it("غياب الإعدادات كلياً = الافتراضيات", () => {
    expect(parseReviewTrackConfig(undefined)).toEqual(DEFAULT_REVIEW_TRACK_CONFIG);
    expect(parseReviewTrackConfig(null)).toEqual(DEFAULT_REVIEW_TRACK_CONFIG);
    expect(parseReviewTrackConfig({})).toEqual(DEFAULT_REVIEW_TRACK_CONFIG);
  });

  it("أشكال تالفة (نص، مصفوفة، أرقام) لا ترمي — الافتراضيات", () => {
    expect(parseReviewTrackConfig("kubra")).toEqual(DEFAULT_REVIEW_TRACK_CONFIG);
    expect(parseReviewTrackConfig(42)).toEqual(DEFAULT_REVIEW_TRACK_CONFIG);
    expect(parseReviewTrackConfig([1, 2])).toEqual(DEFAULT_REVIEW_TRACK_CONFIG);
  });

  it("قيم صحيحة تُقبل كما هي", () => {
    expect(parseReviewTrackConfig({ kubraPages: 20, naming: "swapped" })).toEqual({
      enabled: true,
      kubraPages: 20,
      naming: "swapped",
    });
    expect(parseReviewTrackConfig({ enabled: false, kubraPages: 5, naming: "standard" }).enabled).toBe(false);
  });

  it("kubraPages خارج المجال أو غير صحيح يسقط على الافتراضي", () => {
    expect(parseReviewTrackConfig({ kubraPages: 0 }).kubraPages).toBe(10);
    expect(parseReviewTrackConfig({ kubraPages: KUBRA_PAGES_MAX + 1 }).kubraPages).toBe(10);
    expect(parseReviewTrackConfig({ kubraPages: 10.5 }).kubraPages).toBe(10);
    expect(parseReviewTrackConfig({ kubraPages: NaN }).kubraPages).toBe(10);
    expect(parseReviewTrackConfig({ kubraPages: "15" }).kubraPages).toBe(15); // نص رقمي يُقبل كالاختبارات
    expect(parseReviewTrackConfig({ kubraPages: "كثير" }).kubraPages).toBe(10); // نص غير رقمي لا
  });

  it("الحدّان بالضبط مقبولان، وnaming المجهول = القياسي", () => {
    expect(parseReviewTrackConfig({ kubraPages: KUBRA_PAGES_MIN }).kubraPages).toBe(1);
    expect(parseReviewTrackConfig({ kubraPages: KUBRA_PAGES_MAX }).kubraPages).toBe(60);
    expect(parseReviewTrackConfig({ naming: "مبدّل" }).naming).toBe("standard");
  });
});

describe("validateReviewTrackSettings — تحقق التحديث برسائل عربية", () => {
  it("ضبط كامل صحيح يمر", () => {
    expect(validateReviewTrackSettings({ kubraPages: 15, naming: "swapped" })).toEqual({
      ok: true,
      value: { kubraPages: 15, naming: "swapped" },
    });
  });

  it("ليس كائناً (null/مصفوفة/غياب) يُرفض برسالة الصيغة", () => {
    for (const bad of [null, undefined, [], "x", 7]) {
      const result = validateReviewTrackSettings(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("صيغة");
    }
  });

  it("عدد الصفحات خارج ١–٦ أو غير صحيح يُرفض برسالة المجال", () => {
    for (const bad of [0, -3, 61, 10.5, "12", NaN]) {
      const result = validateReviewTrackSettings({ kubraPages: bad, naming: "standard" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain("بين 1 و60");
    }
  });

  it("تسمية مجهولة تُرفض برسالتها", () => {
    const result = validateReviewTrackSettings({ kubraPages: 10, naming: "mixed" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("تسمية");
  });
});

describe("reviewTrackLabels — تسميتا العرض", () => {
  it("القياسية: المجاورة (sabqi) = الكبرى والباقي (manzil) = الصغرى", () => {
    expect(reviewTrackLabels("standard")).toEqual({ sabqi: "الكبرى", manzil: "الصغرى" });
  });

  it("المبدَّلة: الأسماء تنعكس والقيم كما هي", () => {
    expect(reviewTrackLabels("swapped")).toEqual({ sabqi: "الصغرى", manzil: "الكبرى" });
  });
});

describe("reviewTrackTermsText — شرح المصطلحات بالإعدادات", () => {
  it("يستخدم الاسمين والعدد المضبوط", () => {
    expect(reviewTrackTermsText({ kubraPages: 10, naming: "standard" })).toBe(
      "«الكبرى» المراجعة بعد الحفظ الجديد مباشرة (10 صفحات)، و«الصغرى» ما بعد الكبرى من المحفوظ",
    );
    expect(reviewTrackTermsText({ kubraPages: 5, naming: "swapped" })).toBe(
      "«الصغرى» المراجعة بعد الحفظ الجديد مباشرة (5 صفحات)، و«الكبرى» ما بعد الصغرى من المحفوظ",
    );
  });
});

describe("reviewTextWithTracks مع الإعدادات", () => {
  const segments = [{ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 }];
  const log = {
    reviewSegments: segments,
    reviewSegmentTracks: ["sabqi" as const],
  } as unknown as WardLog;

  it("معطّلة: نص المقاطع بلا لاحقة التصنيف إطلاقاً", () => {
    expect(reviewTextWithTracks(log, null, { enabled: false, kubraPages: 10, naming: "standard" })).toBe("الملك (كاملة)");
  });

  it("معطّلة مع نص قديم موجود: تُعرض المقاطع بلا لاحقة لا النص القديم", () => {
    expect(reviewTextWithTracks(log, "نص قديم", { enabled: false, kubraPages: 10, naming: "swapped" })).toBe(
      "الملك (كاملة)",
    );
  });

  it("مبدَّلة: الاسم المعروض بحسب تسمية الجامع والقيمة كما خُزِّنت", () => {
    expect(reviewTextWithTracks(log, null, { enabled: true, kubraPages: 10, naming: "swapped" })).toBe(
      "الملك (كاملة) (الصغرى)",
    );
  });

  it("بلا إعدادات: التسمية القياسية كما قائم (توافق)", () => {
    expect(reviewTextWithTracks(log, null)).toBe("الملك (كاملة) (الكبرى)");
  });
});
