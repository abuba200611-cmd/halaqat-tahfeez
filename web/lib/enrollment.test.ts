import { describe, expect, it } from "vitest";
import {
  hasFreeSeat,
  matchesCriteria,
  moveInWaitlist,
  nextWaitlistOrder,
  occupancyRatio,
  parseBirthYear,
  parseCriteria,
  pickHalaqah,
  seatsLeft,
  selectPromotions,
  waitlistPositions,
  type HalaqahSlot,
  type WaitEntry,
} from "./enrollment";

const YEAR = 2026;
const slot = (over: Partial<HalaqahSlot> & { id: number }): HalaqahSlot => ({
  name: `حلقة ${over.id}`,
  capacity: null,
  count: 0,
  minAge: null,
  maxAge: null,
  level: null,
  ...over,
});
const anyone = { birthYear: null, level: null } as const;

describe("السعة", () => {
  it("بلا سعة = مقاعد مفتوحة دائماً", () => {
    expect(seatsLeft(slot({ id: 1, count: 50 }))).toBeNull();
    expect(hasFreeSeat(slot({ id: 1, count: 50 }))).toBe(true);
  });
  it("تُحسب المقاعد الشاغرة ولا تنزل تحت الصفر", () => {
    expect(seatsLeft(slot({ id: 1, capacity: 10, count: 7 }))).toBe(3);
    expect(seatsLeft(slot({ id: 1, capacity: 10, count: 12 }))).toBe(0);
    expect(hasFreeSeat(slot({ id: 1, capacity: 10, count: 10 }))).toBe(false);
  });
  it("نسبة الإشغال", () => {
    expect(occupancyRatio(slot({ id: 1, capacity: 20, count: 5 }))).toBe(0.25);
    expect(occupancyRatio(slot({ id: 1, count: 5 }))).toBeNull();
  });
});

describe("معايير الحلقة", () => {
  it("نطاق العمر شاملٌ للحدّين", () => {
    const s = slot({ id: 1, minAge: 8, maxAge: 12 });
    expect(matchesCriteria(s, { birthYear: YEAR - 8, level: null }, YEAR)).toBe(true);
    expect(matchesCriteria(s, { birthYear: YEAR - 12, level: null }, YEAR)).toBe(true);
    expect(matchesCriteria(s, { birthYear: YEAR - 7, level: null }, YEAR)).toBe(false);
    expect(matchesCriteria(s, { birthYear: YEAR - 13, level: null }, YEAR)).toBe(false);
  });
  it("معيار عمر مقيِّد لا يتحقق لمن بلا سنة ميلاد", () => {
    expect(matchesCriteria(slot({ id: 1, minAge: 8 }), anyone, YEAR)).toBe(false);
    expect(matchesCriteria(slot({ id: 1 }), anyone, YEAR)).toBe(true);
  });
  it("المستوى يجب أن يطابق تماماً", () => {
    const s = slot({ id: 1, level: "advanced" });
    expect(matchesCriteria(s, { birthYear: null, level: "advanced" }, YEAR)).toBe(true);
    expect(matchesCriteria(s, { birthYear: null, level: "beginner" }, YEAR)).toBe(false);
    expect(matchesCriteria(s, anyone, YEAR)).toBe(false);
  });
});

describe("اختيار الحلقة", () => {
  it("الأقل طلاباً أولاً", () => {
    const picked = pickHalaqah([slot({ id: 1, count: 9 }), slot({ id: 2, count: 3 }), slot({ id: 3, count: 6 })], anyone, YEAR);
    expect(picked?.id).toBe(2);
  });
  it("التعادل يُكسر بالأصغر معرّفاً", () => {
    const picked = pickHalaqah([slot({ id: 7, count: 4 }), slot({ id: 3, count: 4 }), slot({ id: 5, count: 4 })], anyone, YEAR);
    expect(picked?.id).toBe(3);
  });
  it("تُتخطّى الحلقة الممتلئة حتى لو كانت الأقل", () => {
    const picked = pickHalaqah([slot({ id: 1, capacity: 5, count: 5 }), slot({ id: 2, capacity: 30, count: 20 })], anyone, YEAR);
    expect(picked?.id).toBe(2);
  });
  it("تُتخطّى غير المطابقة للمعايير", () => {
    const kid = { birthYear: YEAR - 9, level: null };
    const picked = pickHalaqah([slot({ id: 1, minAge: 13 }), slot({ id: 2, minAge: 6, maxAge: 10, count: 8 })], kid, YEAR);
    expect(picked?.id).toBe(2);
  });
  it("لا مرشَّح ← null (انتظار)", () => {
    expect(pickHalaqah([slot({ id: 1, capacity: 1, count: 1 })], anyone, YEAR)).toBeNull();
    expect(pickHalaqah([], anyone, YEAR)).toBeNull();
  });
});

describe("قائمة الانتظار", () => {
  const w = (id: number, order: number, birthYear: number | null = null, level: WaitEntry["registrant"]["level"] = null): WaitEntry => ({
    id,
    order,
    registrant: { birthYear, level },
  });

  it("الأدوار بحسب الترتيب ثم المعرّف", () => {
    const positions = waitlistPositions([
      { id: 9, order: 2 },
      { id: 4, order: 1 },
      { id: 3, order: 2 },
    ]);
    expect([...positions.entries()]).toEqual([
      [4, 1],
      [3, 2],
      [9, 3],
    ]);
  });
  it("الدخول الجديد في آخر القائمة", () => {
    expect(nextWaitlistOrder([])).toBe(1);
    expect(nextWaitlistOrder([{ order: 3 }, { order: 7 }])).toBe(8);
  });
  it("الترقية: أول منتظر يطابق، بعدد المقاعد الشاغرة", () => {
    const s = slot({ id: 1, capacity: 10, count: 8 });
    const picked = selectPromotions(s, [w(30, 3), w(10, 1), w(20, 2)], YEAR);
    expect(picked.map((e) => e.id)).toEqual([10, 20]);
  });
  it("الترقية تتخطّى غير المطابق ولا تُضيع دوره", () => {
    const s = slot({ id: 1, capacity: 5, count: 4, level: "advanced" });
    const picked = selectPromotions(s, [w(1, 1, null, "beginner"), w(2, 2, null, "advanced"), w(3, 3, null, "advanced")], YEAR);
    expect(picked.map((e) => e.id)).toEqual([2]);
  });
  it("حلقة ممتلئة ← لا ترقية", () => {
    expect(selectPromotions(slot({ id: 1, capacity: 5, count: 5 }), [w(1, 1)], YEAR)).toEqual([]);
  });
  it("حلقة صارت بلا سعة ← يُرقّى كل مطابق", () => {
    expect(selectPromotions(slot({ id: 1, count: 50 }), [w(1, 1), w(2, 2)], YEAR).map((e) => e.id)).toEqual([1, 2]);
  });
  it("إعادة الترتيب: تبديل جار، وحافة/غائب = null", () => {
    expect(moveInWaitlist([1, 2, 3], 2, "up")).toEqual([2, 1, 3]);
    expect(moveInWaitlist([1, 2, 3], 2, "down")).toEqual([1, 3, 2]);
    expect(moveInWaitlist([1, 2, 3], 1, "up")).toBeNull();
    expect(moveInWaitlist([1, 2, 3], 3, "down")).toBeNull();
    expect(moveInWaitlist([1, 2, 3], 9, "up")).toBeNull();
  });
});

describe("التحقق من المدخلات", () => {
  it("سعة ومعايير صحيحة، والفارغ = بلا قيد", () => {
    expect(parseCriteria({ capacity: "20", minAge: 7, maxAge: "12", level: "beginner" })).toEqual({
      ok: true,
      value: { capacity: 20, minAge: 7, maxAge: 12, level: "beginner" },
    });
    expect(parseCriteria({ capacity: "", minAge: null })).toEqual({
      ok: true,
      value: { capacity: null, minAge: null, maxAge: null, level: null },
    });
  });
  it("يرفض السعة الصفر/الكسر/النص، وعمراً مقلوباً، ومستوى مجهولاً", () => {
    expect(parseCriteria({ capacity: 0 }).ok).toBe(false);
    expect(parseCriteria({ capacity: "1.5" }).ok).toBe(false);
    expect(parseCriteria({ capacity: "abc" }).ok).toBe(false);
    expect(parseCriteria({ capacity: 501 }).ok).toBe(false);
    expect(parseCriteria({ minAge: 12, maxAge: 8 }).ok).toBe(false);
    expect(parseCriteria({ level: "expert" }).ok).toBe(false);
  });
  it("سنة الميلاد", () => {
    expect(parseBirthYear("2014", YEAR)).toBe(2014);
    expect(parseBirthYear("", YEAR)).toBeNull();
    expect(parseBirthYear("1800", YEAR)).toBe("invalid");
    expect(parseBirthYear("2099", YEAR)).toBe("invalid");
    expect(parseBirthYear("20x4", YEAR)).toBe("invalid");
  });
});
