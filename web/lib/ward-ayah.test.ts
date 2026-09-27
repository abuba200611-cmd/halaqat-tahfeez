import { describe, expect, it } from "vitest";
import { canEditWard, formatAyahRange, formatReviewSegments, parseAyahRange, parseReviewSegments } from "./ward-ayah";

const pos = (surah: number | null, ayah: number | null) => ({ surah, ayah });

describe("parseAyahRange", () => {
  it("يرجع null لقسم فارغ تماماً (اختياري)", () => {
    expect(parseAyahRange(null, "الحفظ")).toBeNull();
    expect(parseAyahRange({ from: pos(null, null), to: pos(null, null) }, "الحفظ")).toBeNull();
  });

  it("يقبل نطاقاً صحيحاً ويحسب صفحاته", () => {
    // الملك كاملة: ٦٧:١ إلى ٦٧:٣٠ — تبدأ بصفحة ٥٦٢
    const result = parseAyahRange({ from: pos(67, 1), to: pos(67, 30) }, "الحفظ");
    expect(result).not.toBeNull();
    expect(result!.ayah).toEqual({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 });
    expect(result!.pages.from).toBe(562);
  });

  it("يقبل نطاقاً يمتد لأكثر من سورة", () => {
    const result = parseAyahRange({ from: pos(1, 1), to: pos(2, 5) }, "المراجعة");
    expect(result).not.toBeNull();
    expect(result!.pages.from).toBe(1);
  });

  it("يرفض حقلاً ناقصاً برسالة واضحة", () => {
    expect(() => parseAyahRange({ from: pos(67, null), to: pos(67, 30) }, "الحفظ")).toThrow(
      "أكمل اختيار السورة والآية",
    );
    expect(() => parseAyahRange({ from: pos(null, 1), to: pos(67, 30) }, "الحفظ")).toThrow(
      "أكمل اختيار السورة والآية",
    );
  });

  it("يرفض آية أكبر من عدد آيات السورة برسالة تسمّي السورة وعدد آياتها", () => {
    // سورة الملك فيها ٣٠ آية فقط
    expect(() => parseAyahRange({ from: pos(67, 1), to: pos(67, 31) }, "الحفظ")).toThrow(
      "سورة الملك فيها 30 آية",
    );
    expect(() => parseAyahRange({ from: pos(67, 0), to: pos(67, 5) }, "الحفظ")).toThrow(
      "أكمل اختيار السورة والآية",
    );
  });

  it("يرفض نهاية قبل البداية بترتيب المصحف", () => {
    expect(() => parseAyahRange({ from: pos(67, 10), to: pos(67, 1) }, "الحفظ")).toThrow(
      "نهاية الورد لازم تكون بعد بدايته في ترتيب المصحف",
    );
    expect(() => parseAyahRange({ from: pos(2, 1), to: pos(1, 1) }, "الحفظ")).toThrow(
      "نهاية الورد لازم تكون بعد بدايته في ترتيب المصحف",
    );
  });

  it("يرفض نطاقاً بسورة فعلياً خارج حدود المصحف فقط", () => {
    expect(() => parseAyahRange({ from: pos(0, 1), to: pos(67, 30) }, "الحفظ")).toThrow(
      "خارج حدود المصحف",
    );
    expect(() => parseAyahRange({ from: pos(1, 1), to: pos(115, 1) }, "الحفظ")).toThrow(
      "خارج حدود المصحف",
    );
  });

  it("يقبل النطاق نفسه بداية ونهاية (آية واحدة)", () => {
    const result = parseAyahRange({ from: pos(1, 1), to: pos(1, 1) }, "الحفظ");
    expect(result).not.toBeNull();
    expect(result!.pages).toEqual({ from: 1, to: 1 });
  });
});

describe("formatAyahRange", () => {
  it("نفس السورة: «الملك 1–15»", () => {
    expect(formatAyahRange({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 15 })).toBe("الملك 1–15");
  });

  it("آية واحدة بلا شرطة: «الملك 1»", () => {
    expect(formatAyahRange({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 1 })).toBe("الملك 1");
  });

  it("نطاق يمتد لأكثر من سورة: «الفاتحة 1 – البقرة 5»", () => {
    expect(formatAyahRange({ fromSurah: 1, fromAyah: 1, toSurah: 2, toAyah: 5 })).toBe("الفاتحة 1 – البقرة 5");
  });
});

describe("parseReviewSegments (STEP 52)", () => {
  it("يرجع null لقائمة فارغة أو غير موجودة (لا مراجعة اليوم)", () => {
    expect(parseReviewSegments(null)).toBeNull();
    expect(parseReviewSegments(undefined)).toBeNull();
    expect(parseReviewSegments([])).toBeNull();
  });

  it("يقبل مقطعاً واحداً ويحسب صفحاته ومجموعها", () => {
    const result = parseReviewSegments([{ from: pos(67, 1), to: pos(67, 30) }]);
    expect(result).not.toBeNull();
    expect(result!.segments).toEqual([{ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 }]);
    expect(result!.pagesTotal).toBe(result!.pages[0].to - result!.pages[0].from + 1);
  });

  it("يجمع صفحات عدة مقاطع منفصلة بدقة (لا يحسب فجوة بينها)", () => {
    // الفاتحة (صفحة واحدة تقريباً) + الملك كاملة (٣ صفحات: ٥٦٢-٥٦٤) — لا نطاق واحد يمتد بينهما
    const result = parseReviewSegments([
      { from: pos(1, 1), to: pos(1, 7) },
      { from: pos(67, 1), to: pos(67, 30) },
    ]);
    expect(result).not.toBeNull();
    expect(result!.segments.length).toBe(2);
    const expectedTotal =
      result!.pages[0].to - result!.pages[0].from + 1 + (result!.pages[1].to - result!.pages[1].from + 1);
    expect(result!.pagesTotal).toBe(expectedTotal);
    // يجب ألا يساوي عرض النطاق الكامل من أول صفحة لآخر صفحة (ذاك خطأ الحساب القديم الذي نتفاداه)
    const wrongSpanWidth = result!.pages[1].to - result!.pages[0].from + 1;
    expect(result!.pagesTotal).toBeLessThan(wrongSpanWidth);
  });

  it("يرفض أكثر من 10 مقاطع", () => {
    const segments = Array.from({ length: 11 }, () => ({ from: pos(1, 1), to: pos(1, 1) }));
    expect(() => parseReviewSegments(segments)).toThrow("أقصى عدد مقاطع للمراجعة هو 10");
  });

  it("يقبل بالضبط 10 مقاطع", () => {
    const segments = Array.from({ length: 10 }, () => ({ from: pos(1, 1), to: pos(1, 1) }));
    const result = parseReviewSegments(segments);
    expect(result).not.toBeNull();
    expect(result!.segments.length).toBe(10);
  });

  it("يرفض مقطعاً ناقصاً برسالة تحدّد رقم المقطع بالضبط", () => {
    expect(() =>
      parseReviewSegments([
        { from: pos(1, 1), to: pos(1, 7) },
        { from: pos(67, null), to: pos(67, 30) },
      ]),
    ).toThrow("المقطع 2: أكمل اختيار السورة والآية");
  });

  it("يرفض مقطعاً مُضافاً صراحة لكنه فارغ تماماً (لا يُسقَط صامتاً)", () => {
    expect(() => parseReviewSegments([{ from: pos(null, null), to: pos(null, null) }])).toThrow(
      "المقطع 1: أكمل اختيار السورة والآية",
    );
  });

  it("يرفض ترتيباً معكوساً داخل مقطع واحد برسالة تحدّد رقمه", () => {
    expect(() =>
      parseReviewSegments([
        { from: pos(1, 1), to: pos(1, 7) },
        { from: pos(2, 10), to: pos(2, 1) },
      ]),
    ).toThrow("المقطع 2: نهاية الورد لازم تكون بعد بدايته في ترتيب المصحف");
  });
});

describe("formatReviewSegments (STEP 52)", () => {
  it("يضع «(كاملة)» للمقطع اللي يغطّي السورة من أول آية لآخرها", () => {
    expect(formatReviewSegments([{ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 }])).toBe("الملك (كاملة)");
  });

  it("يعرض عدة مقاطع مفصولة بفاصلة عربية: «البقرة 1–20، الملك (كاملة)»", () => {
    const text = formatReviewSegments([
      { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 20 },
      { fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 },
    ]);
    expect(text).toBe("البقرة 1–20، الملك (كاملة)");
  });

  it("مقطع جزئي من سورة لا يأخذ «(كاملة)»", () => {
    expect(formatReviewSegments([{ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 15 }])).toBe("الملك 1–15");
  });
});

describe("canEditWard (STEP 52 — قفل التعديل بعد قرار المعلّم)", () => {
  it("قابل للتعديل: new و seen (لم يقرر المعلّم بعد)", () => {
    expect(canEditWard("new")).toBe(true);
    expect(canEditWard("seen")).toBe(true);
  });

  it("مقفل: approved و needs_revision (المعلّم اتخذ قراراً)", () => {
    expect(canEditWard("approved")).toBe(false);
    expect(canEditWard("needs_revision")).toBe(false);
  });
});
