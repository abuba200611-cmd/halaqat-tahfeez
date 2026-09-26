import { describe, expect, it } from "vitest";
import { formatAyahRange, parseAyahRange } from "./ward-ayah";

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
