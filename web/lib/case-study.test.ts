import { describe, expect, it } from "vitest";
import {
  CASE_TEXT_MAX,
  parseActionBody,
  parseCaseId,
  parseFieldsBody,
  parseOpenBody,
  parseStatusBody,
  suggestCandidates,
  type SuggestionInput,
} from "./case-study";

const TODAY = "2026-10-12";
const base = (over: Partial<SuggestionInput>): SuggestionInput => ({
  studentId: "s1",
  name: "أحمد",
  planStatus: "on_track",
  attendance: { days: 10, presentPct: 100 },
  lastWardDate: "2026-10-11",
  ...over,
});

describe("suggestCandidates (STEP 65)", () => {
  it("طالب سليم لا يُرشَّح", () => {
    expect(suggestCandidates([base({})], [], TODAY)).toEqual([]);
  });

  it("متأخر عن الخطة", () => {
    expect(suggestCandidates([base({ planStatus: "behind" })], [], TODAY)[0].reasons).toEqual(["behind_plan"]);
  });

  it("بلا خطة أو متقدّم لا يرشّح بسبب الخطة", () => {
    expect(suggestCandidates([base({ planStatus: null }), base({ studentId: "s2", planStatus: "ahead" })], [], TODAY)).toEqual([]);
  });

  it("حضور أقل من ٧٠٪ يرشّح، و٧٠٪ بالضبط لا", () => {
    expect(suggestCandidates([base({ attendance: { days: 10, presentPct: 69 } })], [], TODAY)[0].reasons).toEqual(["low_attendance"]);
    expect(suggestCandidates([base({ attendance: { days: 10, presentPct: 70 } })], [], TODAY)).toEqual([]);
  });

  it("حضور منخفض بأقل من ٣ أيام محسوبة لا يرشّح، وبلا بيانات لا يرشّح", () => {
    expect(suggestCandidates([base({ attendance: { days: 2, presentPct: 0 } })], [], TODAY)).toEqual([]);
    expect(suggestCandidates([base({ attendance: { days: 0, presentPct: null } })], [], TODAY)).toEqual([]);
    expect(suggestCandidates([base({ attendance: null })], [], TODAY)).toEqual([]);
  });

  it("بلا ورد خلال ٧ أيام: حدّ اليوم السابع (قبل ٦ أيام) لا يرشّح، وقبل ٧ أيام يرشّح", () => {
    expect(suggestCandidates([base({ lastWardDate: "2026-10-06" })], [], TODAY)).toEqual([]);
    expect(suggestCandidates([base({ lastWardDate: "2026-10-05" })], [], TODAY)[0].reasons).toEqual(["no_ward"]);
  });

  it("لا أوراد إطلاقاً يرشّح", () => {
    expect(suggestCandidates([base({ lastWardDate: null })], [], TODAY)[0].reasons).toEqual(["no_ward"]);
  });

  it("أسباب متعددة معاً بالترتيب", () => {
    const r = suggestCandidates(
      [base({ planStatus: "behind", attendance: { days: 8, presentPct: 40 }, lastWardDate: null })],
      [],
      TODAY,
    );
    expect(r[0].reasons).toEqual(["behind_plan", "low_attendance", "no_ward"]);
  });

  it("من له حالة مفتوحة يُستبعد حتى لو انطبقت الشروط", () => {
    const rows = [base({ planStatus: "behind" }), base({ studentId: "s2", name: "خالد", planStatus: "behind" })];
    expect(suggestCandidates(rows, ["s1"], TODAY).map((s) => s.studentId)).toEqual(["s2"]);
  });
});

describe("parseCaseId", () => {
  it("يقبل الأعداد الموجبة فقط", () => {
    expect(parseCaseId("12")).toBe(12);
    for (const v of ["0", "-1", "1.5", "abc", "", "1e3", undefined, null]) expect(parseCaseId(v)).toBeNull();
  });
});

describe("parseOpenBody", () => {
  it("يتطلب studentId نصياً غير فارغ", () => {
    expect(parseOpenBody({ studentId: " s1 " })).toEqual({ ok: true, studentId: "s1" });
    expect(parseOpenBody({}).ok).toBe(false);
    expect(parseOpenBody({ studentId: 5 }).ok).toBe(false);
    expect(parseOpenBody({ studentId: "" }).ok).toBe(false);
  });
});

describe("parseFieldsBody", () => {
  it("يقبل ٢٠٠٠ حرف ويرفض ٢٠٠١", () => {
    expect(parseFieldsBody({ diagnosis: "x".repeat(CASE_TEXT_MAX) }).ok).toBe(true);
    expect(parseFieldsBody({ plan: "x".repeat(CASE_TEXT_MAX + 1) }).ok).toBe(false);
  });
  it("يرفض غير النصوص ويتطلب حقلاً واحداً", () => {
    expect(parseFieldsBody({ strengths: 5 }).ok).toBe(false);
    expect(parseFieldsBody({}).ok).toBe(false);
    expect(parseFieldsBody({ halaqahId: 9 }).ok).toBe(false);
  });
  it("يمرّر الحقول المُرسَلة فقط", () => {
    const r = parseFieldsBody({ weaknesses: "  ضعف  ", junk: "x" });
    expect(r).toEqual({ ok: true, fields: { weaknesses: "ضعف" } });
  });
});

describe("parseActionBody", () => {
  it("الإجراء مطلوب وغير فارغ", () => {
    expect(parseActionBody({}).ok).toBe(false);
    expect(parseActionBody({ action: "   " }).ok).toBe(false);
    expect(parseActionBody({ action: "اتصال" })).toEqual({ ok: true, actionDate: null, action: "اتصال", result: null });
  });
  it("حدود الطول والتاريخ", () => {
    expect(parseActionBody({ action: "x".repeat(CASE_TEXT_MAX + 1) }).ok).toBe(false);
    expect(parseActionBody({ action: "a", result: "x".repeat(CASE_TEXT_MAX + 1) }).ok).toBe(false);
    expect(parseActionBody({ action: "a", actionDate: "2026-02-31" }).ok).toBe(false);
    expect(parseActionBody({ action: "a", actionDate: "2026-10-12", result: "تحسّن" })).toEqual({
      ok: true,
      actionDate: "2026-10-12",
      action: "a",
      result: "تحسّن",
    });
  });
  it("نتيجة فارغة تصير null", () => {
    expect(parseActionBody({ action: "a", result: "  " })).toMatchObject({ ok: true, result: null });
  });
});

describe("parseStatusBody", () => {
  it("open/closed فقط", () => {
    expect(parseStatusBody({ status: "closed" })).toEqual({ ok: true, status: "closed" });
    expect(parseStatusBody({ status: "x" }).ok).toBe(false);
  });
});
