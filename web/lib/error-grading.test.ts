import { describe, expect, it } from "vitest";
import {
  DEFAULT_ERROR_GRADING_CONFIG as D,
  averageScore,
  bandFor,
  computeErrorScore,
  formatScore,
  gradeWard,
  mergeErrorGradingConfig,
  parseErrorCounts,
  parseErrorGradingConfig,
} from "./error-grading";

const clone = () => JSON.parse(JSON.stringify(D)) as typeof D;

describe("computeErrorScore — الحساب", () => {
  it("بلا أخطاء = درجة الأساس", () => {
    expect(computeErrorScore(D, {})).toBe(100);
  });

  it("يخصم كل نوع بعدده (الافتراضيات)", () => {
    // 2×2 + 1×1 + 3×0.5 + 1×0.5 = 7
    expect(computeErrorScore(D, { hifz: 2, hesitation: 1, tajweed: 3, tashkeel: 1 })).toBe(93);
  });

  it("لا فاصلة عائمة: ٠٫٥ × ٣ مرّات وغيرها دقيقة", () => {
    expect(computeErrorScore(D, { tajweed: 3 })).toBe(98.5);
    expect(computeErrorScore(D, { tajweed: 7, tashkeel: 5 })).toBe(94);
  });

  it("لا تنزل عن صفر", () => {
    expect(computeErrorScore(D, { hifz: 50, hesitation: 50 })).toBe(0);
  });

  it("يتجاهل مفاتيح غير معروفة في الحساب (الأمان يُفرض في التحقق)", () => {
    expect(computeErrorScore(D, { nope: 9 })).toBe(100);
  });

  it("يحترم درجة أساس مخصّصة", () => {
    const c = clone();
    c.baseScore = 50;
    expect(computeErrorScore(c, { hifz: 5 })).toBe(40);
  });
});

describe("bandFor — التقديرات عند الحدود", () => {
  it.each([
    [100, "ممتاز"],
    [90, "ممتاز"],
    [89.75, "جيد جداً"],
    [80, "جيد جداً"],
    [79.5, "جيد"],
    [70, "جيد"],
    [69.99, "مقبول"],
    [60, "مقبول"],
    [59.5, "يحتاج إعادة"],
    [0, "يحتاج إعادة"],
  ])("الدرجة %s ← %s", (score, band) => {
    expect(bandFor(D, score)).toBe(band);
  });
});

describe("gradeWard — تحقق وحساب", () => {
  it("يحسب الدرجة والتقدير ويحذف الأصفار", () => {
    const r = gradeWard(D, { hifz: 5, tajweed: 0, hesitation: 1 });
    expect(r).toEqual({ ok: true, value: { counts: { hifz: 5, hesitation: 1 }, score: 89, band: "جيد جداً" } });
  });

  it.each([
    [{ unknown: 1 }, "نوع خطأ غير معروف"],
    [{ hifz: -1 }, "عدد الأخطاء"],
    [{ hifz: 1.5 }, "عدد الأخطاء"],
    [{ hifz: 51 }, "عدد الأخطاء"],
    [{ hifz: "2" }, "عدد الأخطاء"],
    [[], "عدّادات"],
    [null, "عدّادات"],
    ["x", "عدّادات"],
  ])("يرفض %j", (input, fragment) => {
    const r = gradeWard(D, input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(fragment);
  });

  it("parseErrorCounts يرفض مفتاحاً لم يعد ضمن إعدادات الجامع", () => {
    const c = clone();
    c.errorTypes = c.errorTypes.filter((t) => t.key !== "tashkeel");
    expect(parseErrorCounts(c, { tashkeel: 1 }).ok).toBe(false);
  });
});

describe("parseErrorGradingConfig — تحقق الإعدادات", () => {
  it("الافتراضيات صالحة", () => {
    expect(parseErrorGradingConfig(D)).toEqual({ ok: true, value: D });
  });

  it("يقرّب الخصم إلى هلل صحيح", () => {
    const c = clone();
    c.errorTypes[0].points = 1.25;
    const r = parseErrorGradingConfig(c);
    expect(r.ok && r.value.errorTypes[0].points).toBe(1.25);
  });

  const bad: [string, (c: ReturnType<typeof clone>) => void][] = [
    ["درجة أساس صفر", (c) => void (c.baseScore = 0)],
    ["درجة أساس كسرية", (c) => void (c.baseScore = 99.5)],
    ["بلا أنواع", (c) => void (c.errorTypes = [])],
    ["معرّف غير صالح", (c) => void (c.errorTypes[0].key = "Bad Key")],
    ["معرّف مكرّر", (c) => void (c.errorTypes[1].key = c.errorTypes[0].key)],
    ["اسم مكرّر", (c) => void (c.errorTypes[1].label = c.errorTypes[0].label)],
    ["اسم فارغ", (c) => void (c.errorTypes[0].label = "  ")],
    ["خصم سالب", (c) => void (c.errorTypes[0].points = -1)],
    ["خصم صفر", (c) => void (c.errorTypes[0].points = 0)],
    ["خصم لا يطابق المضاعفات", (c) => void (c.errorTypes[0].points = 0.3)],
    ["خصم أكبر من الأساس", (c) => void (c.errorTypes[0].points = 101)],
    ["حدود غير تنازلية", (c) => void (c.bands[1].min = 95)],
    ["حدّ مكرّر", (c) => void (c.bands[1].min = c.bands[0].min)],
    ["آخر حدّ ليس صفراً", (c) => void (c.bands[4].min = 10)],
    ["حدّ أكبر من الأساس", (c) => void (c.bands[0].min = 101)],
    ["تقدير واحد فقط", (c) => void (c.bands = [{ label: "x", min: 0 }])],
    ["أسماء تقديرات مكرّرة", (c) => void (c.bands[1].label = c.bands[0].label)],
  ];
  it.each(bad)("يرفض: %s", (_name, mutate) => {
    const c = clone();
    mutate(c);
    expect(parseErrorGradingConfig(c).ok).toBe(false);
  });

  it("يرفض غير الكائنات", () => {
    for (const v of [null, [], "x", 5, undefined]) expect(parseErrorGradingConfig(v).ok).toBe(false);
  });

  it("أكثر من ١٢ نوعاً مرفوض", () => {
    const c = clone();
    c.errorTypes = Array.from({ length: 13 }, (_, i) => ({ key: `t${i}`, label: `نوع ${i}`, points: 1 }));
    expect(parseErrorGradingConfig(c).ok).toBe(false);
  });
});

describe("mergeErrorGradingConfig — الافتراضيات دائماً", () => {
  it.each([undefined, null, {}, "x", { baseScore: "x" }])("مخزون تالف %j ← الافتراضي", (stored) => {
    expect(mergeErrorGradingConfig(stored)).toEqual(D);
  });

  it("مخزون صالح يُستخدم", () => {
    const c = clone();
    c.baseScore = 20;
    c.errorTypes = [{ key: "a", label: "أ", points: 1 }];
    c.bands = [
      { label: "ناجح", min: 10 },
      { label: "راسب", min: 0 },
    ];
    expect(mergeErrorGradingConfig(c)).toEqual(c);
  });
});

describe("averageScore / formatScore", () => {
  it("متوسط بخانة عشرية", () => {
    expect(averageScore([90, 95, 100])).toBe(95);
    expect(averageScore([88.5, 91])).toBe(89.8);
    expect(averageScore([])).toBeNull();
  });
  it("تنسيق بلا أصفار زائدة", () => {
    expect(formatScore(90)).toBe("90");
    expect(formatScore(92.5)).toBe("92.5");
  });
});
