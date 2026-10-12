import { describe, expect, it } from "vitest";
import { ENGAGEMENT_WEIGHTS, engagementScore } from "./engagement";

/*
  STEP 66 — اختبار صيغة درجة التفاعل وحدها (بمعزل عن أي بيانات): الأوزان،
  التطبيع والقصّ، وإعادة توزيع وزن المكوّن المفقود.
*/

describe("ENGAGEMENT_WEIGHTS", () => {
  it("الأوزان الأربعة مجموعها ١", () => {
    const total = Object.values(ENGAGEMENT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
    expect(Object.keys(ENGAGEMENT_WEIGHTS).sort()).toEqual(["attendance", "planProgress", "recitation", "wardConsistency"]);
  });
});

describe("engagementScore", () => {
  it("كل المكوّنات مكتملة = ١٠٠", () => {
    expect(
      engagementScore({ attendanceRate: 100, wardConsistency: 1, planProgressPct: 100, recitationAvg: 10 }),
    ).toBe(100);
  });

  it("كل المكوّنات متاحة بصفر = ٠", () => {
    expect(
      engagementScore({ attendanceRate: 0, wardConsistency: 0, planProgressPct: 0, recitationAvg: 0 }),
    ).toBe(0);
  });

  it("كل المكوّنات مفقودة = ٠", () => {
    expect(
      engagementScore({ attendanceRate: null, wardConsistency: null, planProgressPct: null, recitationAvg: null }),
    ).toBe(0);
  });

  it("المكوّن المفقود يُعاد توزيع وزنه على المتاح، لا يُعدّ صفراً", () => {
    // حضور ٨٠٪ وحده متاح → ٨٠ (لا ٢٨ لو عُدّ الباقي صفراً)
    expect(
      engagementScore({ attendanceRate: 80, wardConsistency: null, planProgressPct: null, recitationAvg: null }),
    ).toBe(80);
    // انتظام كامل مع تلاوة ٥/١٠: (٠٫٣×١ + ٠٫١٥×٠٫٥) ÷ ٠٫٤٥ ≈ ٨٣
    expect(
      engagementScore({ attendanceRate: null, wardConsistency: 1, planProgressPct: null, recitationAvg: 5 }),
    ).toBe(83);
  });

  it("مزيج كامل بأوزان معلنة: ٠٫٣٥×٠٫٩ + ٠٫٣×٠٫٥ + ٠٫٢×١ + ٠٫١٥×٠٫٨ ≈ ٧٩", () => {
    expect(
      engagementScore({ attendanceRate: 90, wardConsistency: 0.5, planProgressPct: 100, recitationAvg: 8 }),
    ).toBe(79);
  });

  it("كل قيمة تُقصّ عند اكتمالها فلا تتجاوز الدرجة ١٠٠ ولا تنزل عن ٠", () => {
    expect(
      engagementScore({ attendanceRate: 150, wardConsistency: 2, planProgressPct: 250, recitationAvg: 10 }),
    ).toBe(100);
    expect(
      engagementScore({ attendanceRate: -20, wardConsistency: -1, planProgressPct: -5, recitationAvg: -3 }),
    ).toBe(0);
  });

  it("تقدّم الخطة فوق ١٠٠٪ يُقصّ عند ١٠٠ داخل الصيغة", () => {
    expect(
      engagementScore({ attendanceRate: null, wardConsistency: null, planProgressPct: 250, recitationAvg: null }),
    ).toBe(100);
  });

  it("متوسط التلاوة يُقسم على ١٠", () => {
    expect(
      engagementScore({ attendanceRate: null, wardConsistency: null, planProgressPct: null, recitationAvg: 7 }),
    ).toBe(70);
  });
});
