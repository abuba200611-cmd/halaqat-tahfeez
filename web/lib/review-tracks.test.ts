import { describe, expect, it } from "vitest";
import {
  REVIEW_TRACK_LABEL,
  countReviewTrackPages,
  parseReviewTracks,
  recentReviewStartPage,
  reviewTextWithTracks,
  suggestReviewTrack,
} from "./review-tracks";
import type { PageRange, ReviewTrack, WardLog } from "./types";

const range = (from: number, to: number): PageRange => ({ from, to });
const TODAY = "2026-11-04";

/** يسجّل ورداً مختصراً بالحقول التي تقرأها countReviewTrackPages فقط */
function wardLog(partial: Partial<Pick<WardLog, "date" | "reviewSegments" | "reviewSegmentTracks" | "reviewSegmentPages" | "reviewPagesTotal">>): WardLog {
  return {
    id: 1,
    studentId: "s1",
    studentName: "طالب",
    date: TODAY,
    hifz: null,
    review: null,
    hifzAyah: null,
    reviewAyah: null,
    reviewSegments: null,
    reviewPagesTotal: 0,
    note: "",
    status: "approved",
    createdAt: "x",
    previousAttemptId: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    buddy: null,
    ...partial,
  };
}

describe("parseReviewTracks", () => {
  it("غائب أو null: لا تصنيفات إطلاقاً", () => {
    expect(parseReviewTracks(undefined, 2)).toBeNull();
    expect(parseReviewTracks(null, 0)).toBeNull();
  });

  it("قائمة صحيحة بنفس عدد المقاطع، null لمقطع بلا تصنيف", () => {
    expect(parseReviewTracks(["sabqi", null, "manzil"], 3)).toEqual(["sabqi", null, "manzil"]);
    expect(parseReviewTracks([], 0)).toEqual([]);
  });

  it("عدد لا يطابق المقاطع يُرفض برسالة واضحة", () => {
    expect(() => parseReviewTracks(["sabqi"], 2)).toThrow("عدد التصنيفات");
  });

  it("قيمة خارج سبقي/منزل تُرفض مع رقم المقطع", () => {
    expect(() => parseReviewTracks(["sabqi", "قديم"], 2)).toThrow("للمقطع 2");
  });

  it("ليست مصفوفة تُرفض", () => {
    expect(() => parseReviewTracks("sabqi", 1)).toThrow("صيغة تصنيف المراجعة غير صحيحة");
  });
});

describe("recentReviewStartPage — حدّ السبقي (آخر جزء محفوظ)", () => {
  it("لا حفظ بعد: الصفحة 1 — كل المراجعة قريبة", () => {
    expect(recentReviewStartPage([])).toBe(1);
    expect(recentReviewStartPage([null])).toBe(1);
  });

  it("آخر حفظ صفحة 205 (داخل الجزء 11): السبقي يبدأ 201", () => {
    expect(recentReviewStartPage([range(1, 205)])).toBe(201);
  });

  it("ختم المصحف: السبقي = الجزء الثلاثون من صفحة 582", () => {
    expect(recentReviewStartPage([range(1, 604)])).toBe(582);
  });
});

describe("suggestReviewTrack", () => {
  it("مقطع عند حدّ السبقي أو بعده → سبقي، وقبله → منزل", () => {
    expect(suggestReviewTrack(range(201, 210), 201)).toBe("sabqi");
    expect(suggestReviewTrack(range(200, 210), 201)).toBe("manzil");
  });
});

describe("countReviewTrackPages", () => {
  const seg = (track: ReviewTrack | null, from: number, to: number) => ({
    date: TODAY,
    reviewSegments: [{ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 }],
    reviewSegmentTracks: [track],
    reviewSegmentPages: [range(from, to)],
    reviewPagesTotal: to - from + 1,
  });

  it("لا أوراد: كلها صفر", () => {
    expect(countReviewTrackPages([], 7, TODAY)).toEqual({ sabqi: 0, manzil: 0, untagged: 0 });
  });

  it("يفصل الصفحات بالمسار داخل اليوم نفسه", () => {
    const counts = countReviewTrackPages([wardLog(seg("sabqi", 5, 9)), wardLog(seg("manzil", 100, 101))], 7, TODAY);
    expect(counts).toEqual({ sabqi: 5, manzil: 2, untagged: 0 });
  });

  it("مقطع بلا تصنيف يُحسب ضمن «بلا تصنيف» لا يُهمل", () => {
    const counts = countReviewTrackPages([wardLog(seg(null, 5, 8))], 7, TODAY);
    expect(counts).toEqual({ sabqi: 0, manzil: 0, untagged: 4 });
  });

  it("ورد قديم قبل المقاطع (مقطع واحد بالأعمدة القديمة) يُحسب كله بلا تصنيف عبر reviewPagesTotal", () => {
    const legacy = wardLog({ date: TODAY, reviewPagesTotal: 7 });
    expect(countReviewTrackPages([legacy], 7, TODAY).untagged).toBe(7);
  });

  it("نافذة ٧ أيام شاملة اليوم، و٣٠ أوسع منها — وما قبلهما خارج", () => {
    const day = (offset: number) => new Date(Date.parse(TODAY) - offset * 86400000).toISOString().slice(0, 10);
    const logs = [
      wardLog({ ...seg("sabqi", 1, 2), date: day(0) }),
      wardLog({ ...seg("sabqi", 1, 2), date: day(6) }), // داخل ٧
      wardLog({ ...seg("manzil", 1, 2), date: day(7) }), // خارج ٧ داخل ٣٠
      wardLog({ ...seg("manzil", 1, 2), date: day(29) }), // آخر يوم داخل ٣٠
      wardLog({ ...seg("manzil", 1, 2), date: day(30) }), // خارج ٣٠
      wardLog({ ...seg("sabqi", 1, 2), date: day(100) }), // قديم تماماً
    ];
    const d7 = countReviewTrackPages(logs, 7, TODAY);
    const d30 = countReviewTrackPages(logs, 30, TODAY);
    expect(d7).toEqual({ sabqi: 4, manzil: 0, untagged: 0 });
    expect(d30).toEqual({ sabqi: 4, manzil: 4, untagged: 0 });
  });
});

describe("reviewTextWithTracks", () => {
  const segments = [
    { fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 }, // الملك كاملة
    { fromSurah: 2, fromAyah: 5, toSurah: 2, toAyah: 20 },
  ];

  it("يعرض كل مقطعاً بتصنيفه بين قوسين", () => {
    const log = wardLog({ reviewSegments: segments, reviewSegmentTracks: ["sabqi", "manzil"] });
    expect(reviewTextWithTracks(log, "أصلي")).toBe(`الملك (كاملة) (${REVIEW_TRACK_LABEL.sabqi})، البقرة 5–20 (${REVIEW_TRACK_LABEL.manzil})`);
  });

  it("لا تصنيفات أصلاً: النص الأصلي كما هو", () => {
    const log = wardLog({ reviewSegments: segments, reviewSegmentTracks: null });
    expect(reviewTextWithTracks(log, "أصلي")).toBe("أصلي");
  });

  it("كلها null: لا أقواس فارغة — النص الأصلي كما هو", () => {
    const log = wardLog({ reviewSegments: segments, reviewSegmentTracks: [null, null] });
    expect(reviewTextWithTracks(log, "أصلي")).toBe("أصلي");
  });

  it("خارج نطاق المقاطع (طول غير محاذٍ): النص الأصلي كما هو", () => {
    const log = wardLog({ reviewSegments: segments, reviewSegmentTracks: ["manzil"] });
    expect(reviewTextWithTracks(log, "أصلي")).toBe("أصلي");
  });
});
