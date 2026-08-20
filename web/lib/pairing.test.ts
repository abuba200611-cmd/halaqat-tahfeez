import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, buildCandidates, pageCount, studentJuzes } from "./pairing";
import type { Student } from "./types";

function student(id: string, from: number, to: number, mastery: number): Student {
  return {
    id,
    name: id,
    group: "",
    ranges: [{ from, to, monthsAgo: 0 }],
    mastery: { 1: mastery, 2: mastery, 3: mastery, 4: mastery, 5: mastery },
    active: true,
    rating: 0,
  };
}

describe("pageCount / studentJuzes", () => {
  it("يحسب عدد الصفحات من نطاق واحد", () => {
    expect(pageCount(student("a", 1, 20, 70))).toBe(20);
  });

  it("لا يكرّر صفحة تتداخل في نطاقين", () => {
    const s = student("a", 1, 20, 70);
    s.ranges.push({ from: 15, to: 30, monthsAgo: 0 });
    expect(pageCount(s)).toBe(30); // 1..30 لا 20+16
  });

  it("يرجع الأجزاء الفعلية المحفوظة", () => {
    expect(studentJuzes(student("a", 1, 21, 70))).toEqual([1]);
  });
});

describe("buildCandidates — جوهر المطابقة: تقاطع المحفوظ لا تطابق الموضع", () => {
  it("لا يُنشئ ثنائية لطالبين بنفس (عدد الصفحات) لكن بلا تقاطع فعلي", () => {
    // طالب في أول المصحف وطالب في آخره — نفس الكمية، صفر تقاطع
    const a = student("a", 1, 100, 70);
    const b = student("b", 500, 600, 70);
    const { candidates } = buildCandidates([a, b]);
    expect(candidates).toHaveLength(0);
  });

  it("يُنشئ ثنائية لطالبين متقاطعين فوق الحد الأدنى، بتقاطع محسوب صح", () => {
    const a = student("a", 1, 50, 70);
    const b = student("b", 30, 80, 70);
    const { candidates } = buildCandidates([a, b]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].overlapPages).toBe(21); // الصفحات 30..50
  });

  it("يستبعد تقاطعاً أقل من minOverlapPages", () => {
    const a = student("a", 1, 50, 70);
    const b = student("b", 45, 100, 70);
    // التقاطع 6 صفحات (45..50) — أقل من الحد الافتراضي 20
    const { candidates } = buildCandidates([a, b], DEFAULT_SETTINGS);
    expect(candidates).toHaveLength(0);
  });

  it("يستبعد ثنائية فارق إتقانها أكبر من maxMasteryGap رغم التقاطع الجيد", () => {
    const a = student("a", 1, 50, 90);
    const b = student("b", 1, 50, 10); // فارق ٨٠، أكبر من الحد الافتراضي ٢٥
    const { candidates } = buildCandidates([a, b], DEFAULT_SETTINGS);
    expect(candidates).toHaveLength(0);
  });

  it("يتجاهل الطلاب غير النشطين تماماً", () => {
    const a = student("a", 1, 50, 70);
    const b = { ...student("b", 1, 50, 70), active: false };
    const { candidates, active } = buildCandidates([a, b]);
    expect(active).toHaveLength(1);
    expect(candidates).toHaveLength(0);
  });
});
