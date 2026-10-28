import { describe, expect, it } from "vitest";
import { computeStreak, hifzPagesCovered, hifzRangeText, latestHifzProgress, reviewRangeText } from "./student-ward-display";
import type { WardUnit } from "./halaqah-stage";
import type { AyahRange, PageRange, WardLog } from "./types";

/** ورد وهمي — hifz إلزامي، date وhifzAyah اختياريان بقيم افتراضية لمن لا يهتمّ بهما */
function makeLog(hifz: PageRange | null, opts: { date?: string; hifzAyah?: AyahRange } = {}): WardLog {
  return {
    id: 0,
    studentId: "s1",
    studentName: "",
    date: opts.date ?? "2026-01-01",
    hifz,
    review: null,
    hifzAyah: opts.hifzAyah ?? null,
    reviewAyah: null,
    reviewSegments: null,
    reviewPagesTotal: 0,
    note: "",
    status: "new",
    createdAt: "",
    previousAttemptId: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    recordedByTeacherId: null,
    recordedVia: "student",
  };
}

describe("computeStreak (STEP 58 — بتوقيت الرياض)", () => {
  it("بلا أي ورد: صفر", () => {
    expect(computeStreak([], "2026-09-28")).toBe(0);
  });

  it("سجّل اليوم فقط: تتابع من يوم واحد", () => {
    expect(computeStreak(["2026-09-28"], "2026-09-28")).toBe(1);
  });

  it("3 أيام متتالية تنتهي باليوم: تتابع من 3", () => {
    expect(computeStreak(["2026-09-26", "2026-09-27", "2026-09-28"], "2026-09-28")).toBe(3);
  });

  it("آخر تسجيل كان أمس (لم يسجّل اليوم بعد): التتابع لا يزال قائماً (اليوم لم ينتهِ بعد)", () => {
    expect(computeStreak(["2026-09-26", "2026-09-27"], "2026-09-28")).toBe(2);
  });

  it("انقطاع حقيقي: آخر تسجيل قبل يومين أو أكثر — الرصيد صفر لا العدّ القديم", () => {
    expect(computeStreak(["2026-09-20", "2026-09-21", "2026-09-25"], "2026-09-28")).toBe(0);
  });

  it("فجوة بمنتصف السجل توقف العدّ التصاعدي من الأحدث فقط", () => {
    // 28، 27 متتاليان (تتابع 2) — ثم فجوة إلى 24، فيتوقف العدّ هناك
    expect(computeStreak(["2026-09-24", "2026-09-27", "2026-09-28"], "2026-09-28")).toBe(2);
  });

  it("تكرار نفس التاريخ (محاولتان بنفس اليوم) لا يُحسَب مرّتين", () => {
    expect(computeStreak(["2026-09-28", "2026-09-28", "2026-09-27"], "2026-09-28")).toBe(2);
  });
});

describe("hifzPagesCovered (STEP 58 تعديل — عدد الصفحات المختلفة لا آخر صفحة)", () => {
  it("بلا أي ورد حفظ: صفر", () => {
    expect(hifzPagesCovered([])).toBe(0);
    expect(hifzPagesCovered([makeLog(null)])).toBe(0);
  });

  it("ورد واحد: عدد صفحاته بالضبط", () => {
    expect(hifzPagesCovered([makeLog({ from: 1, to: 5 })])).toBe(5);
  });

  it("وردان بلا تداخل وبترتيب عكسي (قفز للخلف): المجموع لا آخر صفحة", () => {
    expect(hifzPagesCovered([makeLog({ from: 582, to: 604 }), makeLog({ from: 560, to: 562 })])).toBe(26);
  });

  it("وردان متداخلان: الصفحة المشتركة تُحسب مرّة واحدة فقط", () => {
    expect(hifzPagesCovered([makeLog({ from: 1, to: 10 }), makeLog({ from: 8, to: 15 })])).toBe(15);
  });

  it("ورد مراجعة فقط (hifz فارغ) لا يُحتسب", () => {
    const log = { ...makeLog(null), review: { from: 1, to: 4 } };
    expect(hifzPagesCovered([log])).toBe(0);
  });
});

describe("latestHifzProgress (STEP 58 تعديل — أحدث ورد بالتاريخ لا أكبر صفحة)", () => {
  it("بلا أي ورد حفظ: null", () => {
    expect(latestHifzProgress([])).toBeNull();
    expect(latestHifzProgress([makeLog(null)])).toBeNull();
  });

  it("ورد أبعد صفحة قديم + ورد أحدث بصفحة أقرب: يأخذ الأحدث بالتاريخ لا الأبعد صفحة", () => {
    // نفس مثال المستخدم: آخر ورد حفظ فعلياً التحريم ١–١٢ (٥٦٠–٥٦٢)
    // رغم أن ورداً أقدم وصل صفحة ٦٠٤ (سورة الناس)
    const logs = [
      makeLog({ from: 560, to: 562 }, { date: "2026-09-29", hifzAyah: { fromSurah: 66, fromAyah: 1, toSurah: 66, toAyah: 12 } }),
      makeLog({ from: 582, to: 604 }, { date: "2026-09-28", hifzAyah: { fromSurah: 78, fromAyah: 1, toSurah: 114, toAyah: 6 } }),
    ];
    expect(latestHifzProgress(logs)).toEqual({ page: 562, surah: 66 });
  });

  it("بلا hifzAyah (ورد قديم بالصفحات فقط): يشتقّ السورة من الصفحة", () => {
    expect(latestHifzProgress([makeLog({ from: 600, to: 604 }, { date: "2026-09-29" })])).toEqual({
      page: 604,
      surah: 114,
    });
  });

  it("وردان بنفس أحدث تاريخ: يُفضَّل الأول بترتيب logs (الأحدث إرسالاً كما يُعيدها الخادم)", () => {
    const logs = [
      makeLog({ from: 10, to: 12 }, { date: "2026-09-29", hifzAyah: { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 } }),
      makeLog({ from: 1, to: 5 }, { date: "2026-09-29", hifzAyah: { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 } }),
    ];
    expect(latestHifzProgress(logs)).toEqual({ page: 12, surah: 2 });
  });

  it("ورد مراجعة فقط (بلا حفظ) بأحدث تاريخ لا يُعتبر — يتخطّاه لأقدم ورد فيه حفظ", () => {
    const logs = [
      { ...makeLog(null, { date: "2026-09-29" }), review: { from: 1, to: 4 } },
      makeLog({ from: 100, to: 103 }, { date: "2026-09-27", hifzAyah: { fromSurah: 18, fromAyah: 1, toSurah: 18, toAyah: 10 } }),
    ];
    expect(latestHifzProgress(logs)).toEqual({ page: 103, surah: 18 });
  });
});

/*
  001 T031 — العرض بوحدة فئة الحلقة (FR-006/FR-007): الوحدة اختيارية
  والافتراضي = السلوك الحالي حرفياً (لا تغيير ملحوظ للحلقات القائمة
  حتى تُحدَّد فئتها، SC-005)، والورد القديم بلا آيات يُعرض بكل الوحدات
  دون فقد أي معلومة (SC-003).
*/
describe("hifzRangeText — وحدة العرض الاخيارية (001 T031)", () => {
  const FILI: AyahRange = { fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 };

  it("الافتراضي بلا وحدة = السلوك الحالي: الآيات أولاً ثم سقوط الصفحات القديم", () => {
    expect(hifzRangeText({ from: 603, to: 603 }, FILI)).toBe("الفيل 1–5");
    expect(hifzRangeText({ from: 502, to: 504 }, null)).toBe("صفحة 502 إلى 504 · جزء 26");
    expect(hifzRangeText(null, null)).toBeNull();
  });

  it("surah_ayah: السورة والآيات كما اليوم (ابتدائي)", () => {
    expect(hifzRangeText({ from: 603, to: 603 }, FILI, "surah_ayah")).toBe("الفيل 1–5");
  });

  it("ayah_page: الآيات مع عدد الصفحات المقابل (متوسط — US3 سيناريو ٤)", () => {
    expect(hifzRangeText({ from: 603, to: 604 }, { fromSurah: 105, fromAyah: 1, toSurah: 114, toAyah: 6 }, "ayah_page")).toBe(
      "الفيل 1 – الناس 6 · 2 صفحة",
    );
  });

  it("page_wajh: بالأوجه (ثانوي)، وwajh_juz: جزء كامل باسمه (جامعي)", () => {
    expect(hifzRangeText({ from: 502, to: 504 }, null, "page_wajh")).toBe("3 أوجه (ص 502–504)");
    expect(hifzRangeText({ from: 603, to: 603 }, FILI, "page_wajh")).toBe("وجه 603");
    expect(hifzRangeText({ from: 582, to: 604 }, null, "wajh_juz")).toBe("جزء 30");
    expect(hifzRangeText({ from: 502, to: 504 }, null, "wajh_juz")).toBe("3 أوجه (ص 502–504)");
  });

  it("ورد قديم بلا آيات يُعرض بكل الوحدات دون فقد (SC-003)", () => {
    const oldRange: PageRange = { from: 502, to: 504 };
    const units: WardUnit[] = ["surah_ayah", "ayah_page", "page_wajh", "wajh_juz"];
    for (const unit of units) {
      expect(hifzRangeText(oldRange, null, unit)).toBeTruthy();
    }
  });
});

describe("reviewRangeText — وحدة العرض الاخيارية (001 T031)", () => {
  const FILI: AyahRange = { fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 };

  it("الافتراضي بلا وحدة = السلوك الحالي: المقاطع ثم النطاق القديم ثم الصفحات", () => {
    expect(reviewRangeText({ ...makeLog(null), reviewSegments: [FILI], reviewPagesTotal: 1 })).toBe("الفيل (كاملة)");
    expect(reviewRangeText({ ...makeLog(null), reviewAyah: FILI })).toBe("الفيل 1–5");
    expect(reviewRangeText({ ...makeLog(null), review: { from: 502, to: 504 } })).toBe("صفحة 502 إلى 504 · جزء 26");
    expect(reviewRangeText(makeLog(null))).toBeNull();
  });

  it("المقاطع تبقى بأسماء سورها بكل وحدة — لا فقد لمعلومات المراجعة", () => {
    const log = { ...makeLog(null), reviewSegments: [FILI], reviewPagesTotal: 1 };
    expect(reviewRangeText(log, "surah_ayah")).toBe("الفيل (كاملة)");
    expect(reviewRangeText(log, "page_wajh")).toBe("الفيل (كاملة)");
  });

  it("نطاق المراجعة القديم يُعرض بوحدة الفئة: النطاق الواحد بالأوجه، والصفحات المجرّدة كذلك", () => {
    // الفيل ١–٥ تقع بصفحة ٦٠١ بالضبط (مصحف المدينة)
    expect(reviewRangeText({ ...makeLog(null), reviewAyah: FILI }, "page_wajh")).toBe("وجه 601");
    expect(reviewRangeText({ ...makeLog(null), review: { from: 502, to: 504 } }, "page_wajh")).toBe("3 أوجه (ص 502–504)");
    expect(reviewRangeText({ ...makeLog(null), review: { from: 502, to: 504 } }, "ayah_page")).toBe(
      "صفحة 502 إلى 504 · جزء 26",
    );
  });
});
