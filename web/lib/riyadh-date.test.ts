import { afterEach, describe, expect, it, vi } from "vitest";
import { riyadhTodayISO } from "./riyadh-date";

describe("riyadhTodayISO (STEP 54)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("يرجع صيغة YYYY-MM-DD", () => {
    expect(riyadhTodayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("بعد منتصف الليل UTC لكن قبله بالرياض (فارق +3 ساعات): يبقى اليوم السابق بتوقيت الرياض", () => {
    // 2026-09-27 01:00 UTC = 2026-09-27 04:00 الرياض — نفس اليوم فعلياً،
    // فالحالة الحقيقية المهمة هي العكس: قبل منتصف الليل UTC بقليل لكن
    // بعده بالرياض بالفعل (الرياض متقدّمة +3 دائماً).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T22:00:00.000Z")); // = 2026-09-27 01:00 الرياض
    expect(riyadhTodayISO()).toBe("2026-09-27");
  });

  it("قبل الفارق: لا يزال اليوم السابق بتوقيت الرياض أيضاً حين UTC لم يتجاوز منتصف الليل بعد", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T20:00:00.000Z")); // = 2026-09-26 23:00 الرياض
    expect(riyadhTodayISO()).toBe("2026-09-26");
  });
});
