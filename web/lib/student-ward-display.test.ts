import { describe, expect, it } from "vitest";
import { computeStreak, hifzPagesCovered, latestHifzProgress } from "./student-ward-display";
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
