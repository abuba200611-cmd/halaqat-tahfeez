import { describe, expect, it } from "vitest";
import { computeActuals, parsePlanBody, planStatus, summarizePlan } from "./monthly-plan";

const base = { studentId: "s1", month: "1448-04", hifzPagesTarget: 20, reviewPagesTarget: 40 };

describe("parsePlanBody — التحقق (STEP 63)", () => {
  it("خطة صالحة بلا نطاق ولا ملاحظة", () => {
    const r = parsePlanBody(base);
    expect(r).toMatchObject({ ok: true, studentId: "s1", month: "1448-04" });
    if (r.ok) expect(r.targets).toEqual({ hifzPagesTarget: 20, reviewPagesTarget: 40, hifz: null, notes: null });
  });

  it("المستهدفان الصفريان صالحان وبحدّ ٦٠٤", () => {
    expect(parsePlanBody({ ...base, hifzPagesTarget: 0, reviewPagesTarget: 604 }).ok).toBe(true);
  });

  it.each([-1, 605, 1.5, "10", null, undefined])("مستهدف حفظ غير صالح %s", (v) => {
    expect(parsePlanBody({ ...base, hifzPagesTarget: v }).ok).toBe(false);
  });

  it("مستهدف مراجعة خارج الحدّ", () => {
    expect(parsePlanBody({ ...base, reviewPagesTarget: 700 }).ok).toBe(false);
  });

  it.each(["", "2026-10", "1448-13", "1448-4", 5, undefined])("شهر غير صالح %s", (m) => {
    expect(parsePlanBody({ ...base, month: m }).ok).toBe(false);
  });

  it("طالب مفقود", () => {
    expect(parsePlanBody({ ...base, studentId: "  " }).ok).toBe(false);
  });

  it("نطاق حفظ صالح يُحفظ بالسورة والآية", () => {
    const r = parsePlanBody({ ...base, hifz: { from: { surah: 67, ayah: 1 }, to: { surah: 67, ayah: 30 } } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.targets.hifz).toEqual({ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 });
  });

  it("نطاق ناقص أو خارج المصحف أو معكوس مرفوض", () => {
    expect(parsePlanBody({ ...base, hifz: { from: { surah: 67, ayah: 1 }, to: { surah: null, ayah: null } } }).ok).toBe(false);
    expect(parsePlanBody({ ...base, hifz: { from: { surah: 115, ayah: 1 }, to: { surah: 115, ayah: 2 } } }).ok).toBe(false);
    expect(parsePlanBody({ ...base, hifz: { from: { surah: 67, ayah: 5 }, to: { surah: 67, ayah: 1 } } }).ok).toBe(false);
    expect(parsePlanBody({ ...base, hifz: { from: { surah: 67, ayah: 999 }, to: { surah: 67, ayah: 1000 } } }).ok).toBe(false);
    expect(parsePlanBody({ ...base, hifz: "x" }).ok).toBe(false);
  });

  it("نطاق فارغ بالكامل يُعامل كلا نطاق", () => {
    const r = parsePlanBody({ ...base, hifz: { from: { surah: null, ayah: null }, to: { surah: null, ayah: null } } });
    expect(r.ok && r.targets.hifz).toBe(null);
  });

  it("الملاحظة: تُقصّ وتُنظَّف، والفارغة null، وغير النص مرفوضة", () => {
    const long = parsePlanBody({ ...base, notes: `  ${"س".repeat(900)}  ` });
    expect(long.ok && long.targets.notes?.length).toBe(500);
    const empty = parsePlanBody({ ...base, notes: "   " });
    expect(empty.ok && empty.targets.notes).toBe(null);
    expect(parsePlanBody({ ...base, notes: 5 }).ok).toBe(false);
  });
});

describe("computeActuals — الإنجاز من الأوراد", () => {
  it("صفحات حفظ مميّزة (التداخل لا يُعدّ مرتين) ومجموع المراجعة لكل طالب", () => {
    const out = computeActuals([
      { studentId: "a", hifz: { from: 10, to: 12 }, reviewPages: 5 },
      { studentId: "a", hifz: { from: 12, to: 14 }, reviewPages: 3 },
      { studentId: "a", hifz: null, reviewPages: 2 },
      { studentId: "b", hifz: { from: 1, to: 1 }, reviewPages: 0 },
    ]);
    expect(out.a).toEqual({ hifzPages: 5, reviewPages: 10 });
    expect(out.b).toEqual({ hifzPages: 1, reviewPages: 0 });
    expect(out.c).toBeUndefined();
  });

  it("قفز الصفحات: ٥٨٢–٦٠٤ مع ٥٦٠–٥٦٢ = ٢٦ صفحة", () => {
    const out = computeActuals([
      { studentId: "a", hifz: { from: 582, to: 604 }, reviewPages: 0 },
      { studentId: "a", hifz: { from: 560, to: 562 }, reviewPages: 0 },
    ]);
    expect(out.a.hifzPages).toBe(26);
  });
});

describe("planStatus / summarizePlan", () => {
  const range = { start: "2026-10-01", end: "2026-10-30", days: 30 };

  it("منتصف الشهر: متقدّم / على المسار / متأخر", () => {
    expect(planStatus(0.7, 0.5)).toBe("ahead");
    expect(planStatus(0.45, 0.5)).toBe("on_track");
    expect(planStatus(0.2, 0.5)).toBe("behind");
  });

  it("إكمال المستهدف دائماً متقدّم ولو بأول الشهر", () => {
    expect(planStatus(1, 0.03)).toBe("ahead");
  });

  it("أول الشهر بلا إنجاز ليس متأخراً", () => {
    expect(planStatus(0, 1 / 30)).toBe("on_track");
  });

  it("ملخّص بنسب كل بند والإجمالي", () => {
    const p = summarizePlan({ hifzPagesTarget: 20, reviewPagesTarget: 40 }, { hifzPages: 10, reviewPages: 10 }, range, "2026-10-15");
    expect(p).toMatchObject({ hasPlan: true, hifzPct: 50, reviewPct: 25, overallPct: 33, expectedPct: 50, status: "behind" });
  });

  it("بند بمستهدف صفر نسبته null ولا يقسم على صفر", () => {
    const p = summarizePlan({ hifzPagesTarget: 0, reviewPagesTarget: 10 }, { hifzPages: 3, reviewPages: 5 }, range, "2026-10-15");
    expect(p.hifzPct).toBe(null);
    expect(p.reviewPct).toBe(50);
  });

  it("بلا خطة أو بمستهدفات صفرية: بلا حالة", () => {
    expect(summarizePlan(null, { hifzPages: 1, reviewPages: 1 }, range, "2026-10-15")).toMatchObject({ hasPlan: false, status: null });
    expect(
      summarizePlan({ hifzPagesTarget: 0, reviewPagesTarget: 0 }, { hifzPages: 1, reviewPages: 1 }, range, "2026-10-15"),
    ).toMatchObject({ hasPlan: true, status: null });
  });
});
