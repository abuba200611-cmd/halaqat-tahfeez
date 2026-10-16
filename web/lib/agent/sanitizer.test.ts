import { describe, expect, it } from "vitest";

import { lessonRejectionReason, sanitizeLesson } from "./sanitizer";

/*
  منظّف دروس الدليل المشترك: يحذف الأسماء المسجّلة وأرقام الهواتف،
  ويرفض الدرس إن بقي فيه رقم ≥٧ متتالياً أو اسم مسجّل بعد التنظيف.
*/

const NAMES = ["محمد عبدالله", "خالد العتيبي", "Sara Ahmed"];

describe("sanitizeLesson", () => {
  it("يحذف أسماء الأشخاص المسجّلة ويستبدلها بمحرف إخفاء", () => {
    const cleaned = sanitizeLesson("لاحظت أن خالد العتيبي يتفاعل أكثر بالصباح", NAMES);
    expect(cleaned).not.toContain("خالد العتيبي");
    expect(cleaned).toContain("…");
    expect(cleaned).toContain("يتفاعل");
  });

  it("يحذف أرقام الهواتف بأشكالها (متصلة ومفصولة بفراغات وشرَطات)", () => {
    expect(sanitizeLesson("اتصل على 0501234567", NAMES)).not.toContain("0501234567");
    expect(sanitizeLesson("اتصل على 050 123 4567", NAMES)).not.toContain("123");
    expect(sanitizeLesson("جواله 055-123-4567", NAMES)).not.toContain("055");
  });

  it("لا يمسّ الأرقام القصيرة العادية (درجات، أعداد طلاب)", () => {
    const cleaned = sanitizeLesson("التفاعل ارتفع من 60 إلى 85 بالمئة", NAMES);
    expect(cleaned).toContain("60");
    expect(cleaned).toContain("85");
  });

  it("يسامح التشكيل والفراغات عند مطابقة الأسماء", () => {
    const cleaned = sanitizeLesson("ملاحظة عن محمد  عبدالله تحديداً", NAMES);
    expect(cleaned).not.toContain("محمد");
  });

  it("الاسم القصير جداً (أقل من ٤ محارف بعد التسوية) لا يُحذف ولا يُرفض به الدرس", () => {
    const cleaned = sanitizeLesson("قراءة سور قصيرة قبل المغرب أفضل", ["سور"]);
    expect(cleaned).toContain("سور");
    expect(lessonRejectionReason(cleaned, ["سور"])).toBeNull();
  });
});

describe("lessonRejectionReason", () => {
  it("يرفض ما بقي فيه ٧ أرقام متتالية أو أكثر", () => {
    expect(lessonRejectionReason("رقم القسم 1234567", NAMES)).toContain("رقماً");
  });

  it("يرفض ما بقي فيه اسم مسجّل", () => {
    expect(lessonRejectionReason("سألت Sara Ahmed فأجابت", NAMES)).toContain("اسماً");
  });

  it("يقبل درساً نظيفاً", () => {
    expect(lessonRejectionReason("ابدأ الحلقة بمراجعة قصيرة قبل التسميع الجديد", NAMES)).toBeNull();
  });
});
