import { describe, expect, it } from "vitest";
import {
  KUBRA_DEFAULT_PAGES,
  REVIEW_TRACK_LABEL,
  countReviewTrackPages,
  kubraWindow,
  parseReviewTracks,
  reviewTextWithTracks,
  suggestReviewTrackFor,
} from "./review-tracks";
import { pageRangeOfAyahRange } from "./quran-surahs";
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

  it("قيمة خارج الكبرى/الصغرى تُرفض مع رقم المقطع", () => {
    expect(() => parseReviewTracks(["sabqi", "قديم"], 2)).toThrow("للمقطع 2");
  });

  it("ليست مصفوفة تُرفض", () => {
    expect(() => parseReviewTracks("sabqi", 1)).toThrow("صيغة تصنيف المراجعة غير صحيحة");
  });
});

/*
  أمثلة الشرح بالصفحات الحقيقية من بيانات المصحف (lib/quran-surahs):
  الجاثية صفحات 499–502، والأحقاف 502–506، والفتح 511–515 (صفحته
  الثانية 512).
*/
const jathiyahPages = pageRangeOfAyahRange(45, 1, 45, 37);
const ahqafPages = pageRangeOfAyahRange(46, 1, 46, 35);
const fathPages = pageRangeOfAyahRange(48, 1, 48, 29);

describe("kubraWindow — نافذة الكبرى باتجاه الحفظ", () => {
  it("مثال المعلّم: حفظ تنازلي بلغ الجاثية → الكبرى ١٠ صفحات بعدها، من باقي الأحقاف إلى الصفحة الثانية من الفتح", () => {
    // الأقدم فالأحدث: ختم من الناس نزولاً حتى آخر حفظٍ عند الجاثية
    const ranges = [range(582, 604), range(550, 581), range(jathiyahPages.to + 1, 549), jathiyahPages];
    const window = kubraWindow(ranges);
    expect(window).toEqual({ from: jathiyahPages.to + 1, to: jathiyahPages.to + KUBRA_DEFAULT_PAGES });
    expect(window!.from).toBeLessThanOrEqual(ahqafPages.from + 1); // تبدأ من جسد الأحقاف
    expect(ahqafPages.to).toBeLessThanOrEqual(window!.to);
    expect(fathPages.from + 1).toBeLessThanOrEqual(window!.to); // وتنتهي بالصفحة الثانية من الفتح
  });

  it("حفظ تصاعدي من البقرة: الكبرى ١٠ صفحات قبل أول آخر حفظ", () => {
    expect(kubraWindow([range(2, 50), range(51, 120), range(121, 130)])).toEqual({ from: 111, to: 120 });
  });

  it("الترتيب الأقدم فالأحدث أساس الاتجاه — معكوسه (كما تصل الأوراد من الخادم) يفسد النافذة", () => {
    const oldestFirst = [range(582, 604), jathiyahPages];
    expect(kubraWindow(oldestFirst)).toEqual({ from: jathiyahPages.to + 1, to: jathiyahPages.to + KUBRA_DEFAULT_PAGES });
    // نفس النطاقات أحدثها أولاً: آخر نطاق يبدو 582–604 فيُظن حفظاً تصاعدياً
    expect(kubraWindow([...oldestFirst].reverse())).toEqual({ from: 572, to: 581 });
  });

  it("سجل واحد: قاعدة النصف الثاني — بالجاثية (فوق ٣٠٢) تنازلي، وبأول المصحف تصاعدي", () => {
    expect(kubraWindow([jathiyahPages])).toEqual({ from: jathiyahPages.to + 1, to: jathiyahPages.to + KUBRA_DEFAULT_PAGES });
    expect(kubraWindow([range(10, 12)])).toEqual({ from: 1, to: 9 });
  });

  it("تداخل آخر حفظ مع ما قبله (لا دليل اتجاه): قاعدة النصف الثاني نفسها", () => {
    expect(kubraWindow([range(100, 200), range(150, 160)])).toEqual({ from: 140, to: 149 });
    expect(kubraWindow([range(350, 450), range(400, 410)])).toEqual({ from: 411, to: 420 });
  });

  it("تقييد عند حدّي المصحف: لا صفحات قبل ١ ولا بعد ٦٠٤", () => {
    expect(kubraWindow([range(5, 8)])).toEqual({ from: 1, to: 4 }); // تصاعدي، النافذة مقصوصة عند ١
    expect(kubraWindow([range(602, 604), range(598, 601)])).toEqual({ from: 602, to: 604 }); // تنازلي، مقصوصة عند ٦٠٤
  });

  it("آخر حفظ على حدّ المصحف نفسه (صفحة ١ صعوداً أو ٦٠٤ نزولاً): لا كبرى ممكنة → null", () => {
    expect(kubraWindow([range(1, 604)])).toBeNull();
    expect(kubraWindow([range(600, 604)])).toBeNull();
  });

  it("لا حفظ إطلاقاً → null (بلا اقتراح)", () => {
    expect(kubraWindow([])).toBeNull();
    expect(kubraWindow([null, null])).toBeNull();
  });

  it("عدد صفحات مخصص بدل الافتراضي ١٠", () => {
    expect(kubraWindow([jathiyahPages], 5)).toEqual({ from: jathiyahPages.to + 1, to: jathiyahPages.to + 5 });
  });
});

describe("suggestReviewTrackFor — قاعدة التقاطع مع نافذة الكبرى", () => {
  const kubra = { from: 201, to: 210 };

  it("نافذة بلا قيمة → null بلا اقتراح", () => {
    expect(suggestReviewTrackFor(range(205, 208), null)).toBeNull();
  });

  it("مقطع داخل النافذة كاملاً → كبرى", () => {
    expect(suggestReviewTrackFor(range(202, 209), kubra)).toBe("sabqi");
  });

  it("نصف صفحات المقطع فأكثر داخل النافذة → كبرى (النصف بالضبط يدخل)", () => {
    expect(suggestReviewTrackFor(range(206, 215), kubra)).toBe("sabqi"); // ٥ من ١٠ داخل النافذة
  });

  it("أقل من نصف صفحات المقطع داخل النافذة → صغرى", () => {
    expect(suggestReviewTrackFor(range(208, 217), kubra)).toBe("manzil"); // ٣ من ١٠ فقط
  });

  it("خارج النافذة تماماً → صغرى", () => {
    expect(suggestReviewTrackFor(range(1, 10), kubra)).toBe("manzil");
    expect(suggestReviewTrackFor(range(400, 410), kubra)).toBe("manzil");
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
