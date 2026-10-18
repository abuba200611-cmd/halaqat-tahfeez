import { describe, expect, it } from "vitest";
import { normalizeSaudiPhone } from "./phone";

describe("تطبيع أرقام الجوال السعودية", () => {
  it("05xxxxxxxx تتحول إلى 9665xxxxxxxx", () => {
    expect(normalizeSaudiPhone("0501234567")).toBe("966501234567");
    expect(normalizeSaudiPhone("0559876543")).toBe("966559876543");
  });

  it("يقبل الصيغ الدولية الشائعة كلها لنفس الرقم", () => {
    expect(normalizeSaudiPhone("+966501234567")).toBe("966501234567");
    expect(normalizeSaudiPhone("966501234567")).toBe("966501234567");
    expect(normalizeSaudiPhone("00966501234567")).toBe("966501234567");
    expect(normalizeSaudiPhone("501234567")).toBe("966501234567");
  });

  it("يتجاهل الفواصل والمسافات والأقواس ويحوّل الأرقام العربية-الهندية", () => {
    expect(normalizeSaudiPhone("050 123 4567")).toBe("966501234567");
    expect(normalizeSaudiPhone("(050) 123-4567")).toBe("966501234567");
    expect(normalizeSaudiPhone("٠٥٠١٢٣٤٥٦٧")).toBe("966501234567");
  });

  it("يرفض كل ما ليس جوالاً سعودياً صالحاً", () => {
    expect(normalizeSaudiPhone("0111234567")).toBeNull(); // أرضي الرياض
    expect(normalizeSaudiPhone("050123456")).toBeNull(); // رقم ناقص
    expect(normalizeSaudiPhone("05012345678")).toBeNull(); // رقم زائد
    expect(normalizeSaudiPhone("+14155552671")).toBeNull(); // أجنبي
    expect(normalizeSaudiPhone("+966114455667")).toBeNull(); // دولي أرضي
    expect(normalizeSaudiPhone("")).toBeNull();
    expect(normalizeSaudiPhone("hello")).toBeNull();
  });
});
