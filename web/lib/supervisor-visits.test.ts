import { describe, expect, it } from "vitest";

import {
  CRITERION_SCORE_MAX,
  DEFAULT_VISIT_CRITERIA,
  canEditVisit,
  canTransitionVisit,
  computeOverallScore,
  mergeVisitCriteria,
  parseScheduleVisitBody,
  parseVisitCriteriaBody,
  parseVisitScoresBody,
} from "./supervisor-visits";

/*
  B4 — منطق زيارات المشرف النقي: حساب الدرجة الكلية، تحقق درجات المعايير،
  انتقالات الحالة، دمج معايير الجامع المخصصة، وجسم الجدولة.
*/

const CRITERIA = [
  { key: "a", label: "أ" },
  { key: "b", label: "ب" },
  { key: "c", label: "ج" },
];

describe("computeOverallScore", () => {
  it("كل المعايير بخمسات = ١٠٠، وبأصفار = ٠", () => {
    const top = Object.fromEntries(CRITERIA.map((c) => [c.key, { score: CRITERION_SCORE_MAX }]));
    expect(computeOverallScore(CRITERIA, top)).toEqual({ overallScore: 100, scoredCount: 3, complete: true });
    const bottom = Object.fromEntries(CRITERIA.map((c) => [c.key, { score: 0 }]));
    expect(computeOverallScore(CRITERIA, bottom).overallScore).toBe(0);
  });

  it("المتوسط يقرَّب لأقرب صحيح: ٤+٤+٥ من ٣ معايير (١٣/١٥) → ٨٧", () => {
    const scores = { a: { score: 4 }, b: { score: 4 }, c: { score: 5 } };
    // (4+4+5) ÷ (3×5) × 100 = 86.67 → 87
    expect(computeOverallScore(CRITERIA, scores).overallScore).toBe(87);
  });

  it("ناقص معيار واحد = null مهما كانت بقية الدرجات", () => {
    const scores = { a: { score: 5 }, b: { score: 5 } };
    const total = computeOverallScore(CRITERIA, scores);
    expect(total.complete).toBe(false);
    expect(total.overallScore).toBeNull();
    expect(total.scoredCount).toBe(2);
  });

  it("لا معايير = غير مكتمل (لا قسمة على صفر)", () => {
    expect(computeOverallScore([], {}).overallScore).toBeNull();
  });

  it("يقبل شكل الدرجات المخزَّنة (كائن {score,note}) والمجرَّد (رقم) معاً", () => {
    expect(computeOverallScore([{ key: "a", label: "أ" }], { a: 5 }).overallScore).toBe(100);
  });
});

describe("parseVisitScoresBody", () => {
  it("معيار غريب = رفض", () => {
    const parsed = parseVisitScoresBody({ intruder: { score: 3 } }, CRITERIA);
    expect(parsed.ok).toBe(false);
  });

  it("درجة خارج ٠..٥ = رفض (٦ وسالب ونص)", () => {
    for (const bad of [6, -1, 2.5, "3abc"]) {
      const parsed = parseVisitScoresBody({ a: { score: bad } }, CRITERIA);
      expect(parsed.ok).toBe(false);
    }
  });

  it("ملاحظة ليست نصاً = رفض، وملاحظة نصية تُقلَّم", () => {
    expect(parseVisitScoresBody({ a: { score: 3, note: 7 } }, CRITERIA).ok).toBe(false);
    const ok = parseVisitScoresBody({ a: { score: 3, note: "  ممتاز  " } }, CRITERIA);
    expect(ok.ok && ok.scores.a?.note).toBe("ممتاز");
  });

  it("جسم فارغ أو غائب = لا درجات (مسوّدة بعد التقييم الجزئي فقط)", () => {
    expect(parseVisitScoresBody(undefined, CRITERIA)).toEqual({ ok: true, scores: {} });
    expect(parseVisitScoresBody({}, CRITERIA)).toEqual({ ok: true, scores: {} });
  });

  it("درجة غائبة لمعيار = لا سطر له (لم يُقيَّم بعد)", () => {
    const parsed = parseVisitScoresBody({ a: { score: 2 }, b: { score: null } }, CRITERIA);
    expect(parsed.ok && parsed.scores).toEqual({ a: { score: 2 } });
  });
});

describe("انتقالات الحالة", () => {
  it("الملغاة نهائية: لا تعديل ولا انتقال لأي حالة", () => {
    expect(canEditVisit("cancelled")).toBe(false);
    expect(canTransitionVisit("cancelled", "done")).toBe(false);
    expect(canTransitionVisit("cancelled", "scheduled")).toBe(false);
    expect(canTransitionVisit("cancelled", "cancelled")).toBe(false);
  });

  it("من المجدولة: إنهاء وإلغاء فقط", () => {
    expect(canTransitionVisit("scheduled", "done")).toBe(true);
    expect(canTransitionVisit("scheduled", "cancelled")).toBe(true);
    expect(canTransitionVisit("scheduled", "scheduled")).toBe(false);
  });

  it("من المنجزة: إعادة فتح وإعادة إنهاء فقط — لا إلغاء زيارة منجزة", () => {
    expect(canTransitionVisit("done", "scheduled")).toBe(true);
    expect(canTransitionVisit("done", "done")).toBe(true);
    expect(canTransitionVisit("done", "cancelled")).toBe(false);
  });
});

describe("معايير الجامع المخصصة", () => {
  it("قائمة صالحة تُقبل كما هي (مفاتيح فريدة لاتينية)", () => {
    const custom = [
      { key: "x1", label: "الأول" },
      { key: "x2", label: "الثاني" },
    ];
    expect(mergeVisitCriteria({ criteria: custom })).toEqual(custom);
    const body = parseVisitCriteriaBody({ criteria: custom });
    expect(body.ok && body.criteria).toEqual(custom);
  });

  it("مخزون تالف أو ناقص = الافتراضيات، وأي تكرار مفتاح = رفض صريح", () => {
    expect(mergeVisitCriteria(undefined)).toEqual(DEFAULT_VISIT_CRITERIA);
    expect(mergeVisitCriteria({ criteria: "junk" })).toEqual(DEFAULT_VISIT_CRITERIA);
    expect(mergeVisitCriteria({ criteria: [{ key: "a", label: "أ" }, { key: "a", label: "ب" }] })).toEqual(
      DEFAULT_VISIT_CRITERIA,
    );
    expect(parseVisitCriteriaBody({ criteria: [{ key: "a", label: "" }] }).ok).toBe(false);
    expect(parseVisitCriteriaBody({}).ok).toBe(false);
  });
});

describe("parseScheduleVisitBody", () => {
  it("صالح: حلقة وموعد، وmosqueId إلزامي للجمعية فقط", () => {
    const body = { halaqahId: 9, scheduledFor: "2026-11-20", mosqueId: 5 };
    // بدون requireMosqueId يُتجاهل mosqueId بالجسم كلياً — جامع المسار هو المرجع
    expect(parseScheduleVisitBody(body)).toEqual({ ok: true, halaqahId: 9, scheduledFor: "2026-11-20" });
    const mosqueOnly = parseScheduleVisitBody({ halaqahId: 9, scheduledFor: "2026-11-20" }, { requireMosqueId: true });
    expect(mosqueOnly.ok).toBe(false);
  });

  it("موعد معطوب أو أبعد/أقدم من سنة = رفض", () => {
    for (const bad of ["2026-13-01", "not-a-date", "1999-01-01", "2999-01-01"]) {
      expect(parseScheduleVisitBody({ halaqahId: 1, scheduledFor: bad }).ok).toBe(false);
    }
    expect(parseScheduleVisitBody({ halaqahId: 1, scheduledFor: "2026-02-30" }).ok).toBe(false);
  });

  it("معرّف حلقة غير صحيح موجب = رفض", () => {
    expect(parseScheduleVisitBody({ halaqahId: 0, scheduledFor: "2026-11-20" }).ok).toBe(false);
    expect(parseScheduleVisitBody({ halaqahId: 1.5, scheduledFor: "2026-11-20" }).ok).toBe(false);
    expect(parseScheduleVisitBody({ scheduledFor: "2026-11-20" }).ok).toBe(false);
  });
});
