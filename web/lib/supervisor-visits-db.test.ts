import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B4 — نحاكي @netlify/database ونلتقط نصّ SQL وقيمه، فنثبت: انتقالات حالة
  الزيارة (الملغاة نهائية، الإنهاء يستلزم اكتمال المعايير، الإلغاء من
  المجدولة فقط، إعادة الفتح من المنجزة)، والدرجة الكلية تُحسب هنا خادمياً
  وتُمرَّر للتحديث — لا تُقبل من الجسم، وكل استعلام قراءة محصور بنطاقه
  (جامع/جمعية/حلقة).
*/

type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
const results: Record<string, unknown>[][] = [];

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("?"), values });
      return results.length > 0 ? (results.shift() as Record<string, unknown>[]) : [];
    },
  }),
}));

const { DEFAULT_VISIT_CRITERIA } = await import("./supervisor-visits");
const { applyVisitAction, getVisitForAssociation, listDoneVisitsForHalaqah, listVisitsForMosque } = await import(
  "./supervisor-visits-db"
);

beforeEach(() => {
  calls.length = 0;
  results.length = 0;
});

const visit = (patch: Partial<Parameters<typeof applyVisitAction>[0]["visit"]> = {}) => ({
  id: 12,
  associationId: 3,
  mosqueId: 5,
  halaqahId: 9,
  halaqahName: "حلقة",
  visitorKind: "mosque_admin" as const,
  visitorName: "مدير",
  scheduledFor: "2026-11-20",
  visitedAt: null,
  status: "scheduled" as const,
  overallScore: null,
  notes: "",
  recommendations: "",
  createdAt: "2026-11-01T00:00:00.000Z",
  ...patch,
});

const scoreRows = (keys: { key: string }[], score = 5) => keys.map((c) => ({ criterion_key: c.key, score }));

const updates = () => calls.filter((c) => c.text.includes("UPDATE supervisor_visits"));
const inserts = () => calls.filter((c) => c.text.includes("INSERT INTO visit_criteria_scores"));

describe("applyVisitAction — انتقالات الحالة والدرجة الكلية", () => {
  it("زيارة ملغاة نهائية: أي إجراء = 400 بلا أي استعلام", async () => {
    const result = await applyVisitAction({ visit: visit({ status: "cancelled" }), body: { action: "save" } });
    expect(result).toEqual({ ok: false, status: 400, error: "زيارة ملغاة لا تُعدَّل" });
    expect(calls).toHaveLength(0);
  });

  it("إجراء غير معروف = 400", async () => {
    const result = await applyVisitAction({ visit: visit(), body: { action: "delete" } });
    expect(result.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("إنهاء بتقييم ناقص = 400 ولا كتابة", async () => {
    results.push([], scoreRows(DEFAULT_VISIT_CRITERIA.slice(0, 5))); // إعدادات ثم ٥ من ٧ معايير
    const result = await applyVisitAction({
      visit: visit(),
      body: { action: "done", scores: {} }, // بلا درجات جديدة — المخزّنة ناقصة
    });
    expect(result).toEqual({ ok: false, status: 400, error: "إنهاء الزيارة يتطلب تقييم كل المعايير" });
    expect(updates()).toHaveLength(0);
    expect(inserts()).toHaveLength(0);
  });

  it("إنهاء بتقييم كامل = درجة كلية محسوبة خادمياً وتاريخ إنجاز", async () => {
    results.push([], scoreRows(DEFAULT_VISIT_CRITERIA), [], ...DEFAULT_VISIT_CRITERIA.map(() => []), []);
    const result = await applyVisitAction({
      visit: visit(),
      body: { action: "done", notes: "جيدة", recommendations: "استمرار" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visit.status).toBe("done");
    expect(result.visit.overallScore).toBe(100); // كل الدرجات ٥ من ٥
    expect(result.visit.visitedAt).not.toBeNull();
    const update = updates()[0];
    expect(update.values).toContain("done");
    expect(update.values).toContain(100);
    expect(update.values).toContain("جيدة");
  });

  it("الإنهاء يدمج المخزّن مع الجديد: مسوّدة ٥ معايير + جسم يكمل الباقي", async () => {
    const remaining = DEFAULT_VISIT_CRITERIA.slice(5);
    const bodyScores = Object.fromEntries(remaining.map((c) => [c.key, { score: 4 }]));
    results.push([], scoreRows(DEFAULT_VISIT_CRITERIA.slice(0, 5)), [], ...DEFAULT_VISIT_CRITERIA.map(() => []), []);
    const result = await applyVisitAction({ visit: visit(), body: { action: "done", scores: bodyScores } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // (٥×٥ + ٢×٤) ÷ (٧×٥) × ١٠٠ = ٩٤.٣ → ٩٤
    expect(result.visit.overallScore).toBe(94);
    expect(inserts()).toHaveLength(7);
  });

  it("إلغاء زيارة منجزة = 400 (لا تراجع بالإلغاء بعد التقرير)", async () => {
    results.push([], []);
    const result = await applyVisitAction({ visit: visit({ status: "done" }), body: { action: "cancel" } });
    expect(result.ok).toBe(false);
    expect(updates()).toHaveLength(0);
  });

  it("إلغاء زيارة مجدولة = مسموح", async () => {
    results.push([], []);
    const result = await applyVisitAction({ visit: visit(), body: { action: "cancel" } });
    expect(result.ok && result.visit.status).toBe("cancelled");
    expect(updates()[0].values).toContain("cancelled");
  });

  it("إعادة فتح زيارة منجزة = scheduled ودرجة وتاريخ إنجاز مصفّران", async () => {
    results.push([], []);
    const result = await applyVisitAction({
      visit: visit({ status: "done", overallScore: 88, visitedAt: "2026-11-18T10:00:00.000Z" }),
      body: { action: "reopen" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.visit.status).toBe("scheduled");
    expect(result.visit.overallScore).toBeNull();
    expect(result.visit.visitedAt).toBeNull();
    expect(updates()[0].values).toContain("scheduled");
  });
});

describe("تحصين الاستعلامات بالنطاق", () => {
  it("قائمة زيارات الجامع مقيدة بمعرّف الجامع", async () => {
    await listVisitsForMosque(5);
    expect(calls[0].text).toContain("v.mosque_id");
    expect(calls[0].values).toContain(5);
  });

  it("زيارة الجمعية تُقرأ عبر انتماء جامعها للجمعية لا عبر معرّف الزيارة وحده", async () => {
    await getVisitForAssociation(3, 12);
    expect(calls[0].text).toContain("m.association_id");
    expect(calls[0].values).toContain(3);
    expect(calls[0].values).toContain(12);
  });

  it("قائمة المعلّم: المنجزة فقط وبلمعرّف الحلقة المعطى", async () => {
    await listDoneVisitsForHalaqah(9);
    expect(calls[0].text).toContain("v.status = 'done'");
    expect(calls[0].values).toContain(9);
  });
});
