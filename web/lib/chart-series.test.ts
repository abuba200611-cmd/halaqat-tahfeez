import { describe, expect, it } from "vitest";

/*
  اختبارات دوال تشكيل سلاسل الرسوم (مواصفة 003) — منطق نقي بتواريخ ISO
  تقويمية (UTC على النص) فلا يتأثر بمنطقة زمن الجهاز؛ التوقيت بالرياض
  يدخل عند حدّ الاستعلام (riyadhTodayISO وأعمدة date المحلية) لا هنا.
*/

import {
  addDaysISO,
  daysBetweenISO,
  fillDailySeries,
  safePct,
  topNWithOther,
  weekStartISO,
  weeklyBuckets,
} from "./chart-series";

describe("addDaysISO وdaysBetweenISO", () => {
  it("يعبر حدود الشهر والسنة بتقويم صحيح", () => {
    expect(addDaysISO("2025-12-31", 1)).toBe("2026-01-01");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysISO("2026-10-28", 30)).toBe("2026-11-27");
  });

  it("حساب UTC خالص: لا انزياح بتغيّر المنطقة الزمنية للجهاز (توقيت الرياض ثابت UTC+3 بلا توقيت صيفي)", () => {
    // لحظة قرب منتصف الليل بتوقيت الرياض: 2026-10-27T21:00Z سابقاً 2026-10-28 بالرياض
    // الحساب على النص يعطي نفس اليوم أياً كانت منطقة تشغيل الاختبار
    expect(addDaysISO("2026-10-28", 0)).toBe("2026-10-28");
    expect(daysBetweenISO("2026-10-28", "2026-10-29")).toBe(1);
  });

  it("فرق الأيام يبقى صحيحاً عبر تواريخ كان бتعذّر فيها الحساب بالإزاحة المحلية", () => {
    expect(daysBetweenISO("2026-03-06", "2026-03-09")).toBe(3);
    expect(daysBetweenISO("2026-10-01", "2026-10-31")).toBe(30);
    expect(daysBetweenISO("2026-10-28", "2026-10-28")).toBe(0);
  });
});

describe("weekStartISO", () => {
  it("الأحد بداية الأسبوع", () => {
    expect(weekStartISO("2026-10-28")).toBe("2026-10-25"); // الأربعاء 28 → الأحد 25
    expect(weekStartISO("2026-10-25")).toBe("2026-10-25"); // الأحد نفسه
    expect(weekStartISO("2026-10-31")).toBe("2026-10-25"); // السبت آخر الأسبوع
    expect(weekStartISO("2026-11-01")).toBe("2026-11-01"); // أحد أسبوع جديد
  });
});

describe("fillDailySeries", () => {
  it("يملأ الأيام الخالية بأصفار ويرتّب من الأقدم إلى الأحدث", () => {
    const series = fillDailySeries(
      [
        { date: "2026-10-26", value: 4 },
        { date: "2026-10-28", value: 2 },
      ],
      "2026-10-26",
      "2026-10-28",
    );
    expect(series).toEqual([
      { date: "2026-10-26", value: 4 },
      { date: "2026-10-27", value: 0 },
      { date: "2026-10-28", value: 2 },
    ]);
  });

  it("بلا صفوف: كل الأيام أصفاراً (30 يوماً = 30 نقطة)", () => {
    const series = fillDailySeries([], "2026-10-01", "2026-10-30");
    expect(series).toHaveLength(30);
    expect(series.every((p) => p.value === 0)).toBe(true);
  });

  it("حدود الفترة شاملة، وما خارجها يُهمل", () => {
    const series = fillDailySeries(
      [
        { date: "2026-10-01", value: 1 }, // أول يوم — يدخل
        { date: "2026-10-03", value: 3 }, // آخر يوم — يدخل
        { date: "2026-09-30", value: 9 }, // قبل الفترة — يُهمل
        { date: "2026-10-04", value: 9 }, // بعد الفترة — يُهمل
      ],
      "2026-10-01",
      "2026-10-03",
    );
    expect(series).toEqual([
      { date: "2026-10-01", value: 1 },
      { date: "2026-10-02", value: 0 },
      { date: "2026-10-03", value: 3 },
    ]);
  });

  it("يجمع قيم اليوم المكرّر (لا يستبدلها)", () => {
    const series = fillDailySeries(
      [
        { date: "2026-10-01", value: 2 },
        { date: "2026-10-01", value: 5 },
      ],
      "2026-10-01",
      "2026-10-01",
    );
    expect(series).toEqual([{ date: "2026-10-01", value: 7 }]);
  });

  it("بداية بعد النهاية: سلسلة فارغة", () => {
    expect(fillDailySeries([{ date: "2026-10-01", value: 1 }], "2026-10-03", "2026-10-01")).toEqual([]);
  });
});

describe("weeklyBuckets", () => {
  it("12 أسبوعاً تنتهي بأسبوع اليوم، والقيمة عدد الصفوف بكل أسبوع (الأحد بدايته)", () => {
    // الأسبوع الجاري يبدأ الأحد 2026-10-25؛ قبل 11 أسبوعاً: 2026-08-09
    const buckets = weeklyBuckets(
      [
        { date: "2026-10-25" }, // أول أسبوع النافذة الأخير (الحالي)
        { date: "2026-10-28" }, // نفس الأسبوع الحالي
        { date: "2026-08-09" }, // أول أسبوع بالنافذة
        { date: "2026-08-08" }, // قبل النافذة — يُهمل
        { date: "2026-12-01" }, // بعد اليوم — لا أسبوع له — يُهمل
      ],
      12,
      "2026-10-28",
    );
    expect(buckets).toHaveLength(12);
    expect(buckets[0]).toEqual({ label: "9/8", value: 1 });
    expect(buckets[11]).toEqual({ label: "25/10", value: 2 });
    expect(buckets.slice(1, 11).every((b) => b.value === 0)).toBe(true);
  });

  it("التسمية يوم/شهر بلا حشو أصفار", () => {
    const [bucket] = weeklyBuckets([{ date: "2026-01-05" }], 1, "2026-01-05"); // الاثنين 5/1 → أسبوع الأحد 4/1
    expect(bucket).toEqual({ label: "4/1", value: 1 });
  });

  it("أسبوع واحد فقط: صفوفه كلها تُحسب فيه", () => {
    const buckets = weeklyBuckets(
      [{ date: "2026-10-26" }, { date: "2026-10-27" }, { date: "2026-10-31" }],
      1,
      "2026-10-28",
    );
    expect(buckets).toEqual([{ label: "25/10", value: 3 }]);
  });
});

describe("topNWithOther", () => {
  it("أقل من N: الكل مرتّباً تنازلياً بلا «أخرى»", () => {
    const items = [
      { label: "أ", value: 2 },
      { label: "ب", value: 7 },
      { label: "ج", value: 4 },
    ];
    expect(topNWithOther(items, 5, "أخرى")).toEqual([
      { label: "ب", value: 7 },
      { label: "ج", value: 4 },
      { label: "أ", value: 2 },
    ]);
  });

  it("أكثر من N: أفضل N ثم «أخرى» مجموع الباقي في الآخر", () => {
    const items = [
      { label: "ج1", value: 1 },
      { label: "ج2", value: 9 },
      { label: "ج3", value: 5 },
      { label: "ج4", value: 3 },
      { label: "ج5", value: 2 },
    ];
    expect(topNWithOther(items, 3, "أخرى")).toEqual([
      { label: "ج2", value: 9 },
      { label: "ج3", value: 5 },
      { label: "ج4", value: 3 },
      { label: "أخرى", value: 3 },
    ]);
  });

  it("عند التساوي يرتّب بالتسمية لثبات الترتيب", () => {
    const items = [
      { label: "ي", value: 5 },
      { label: "أ", value: 5 },
      { label: "م", value: 5 },
    ];
    expect(topNWithOther(items, 2, "أخرى")).toEqual([
      { label: "أ", value: 5 },
      { label: "م", value: 5 },
      { label: "أخرى", value: 5 },
    ]);
  });

  it("قائمة فارغة: لا عناصر ولا «أخرى»", () => {
    expect(topNWithOther([], 3, "أخرى")).toEqual([]);
  });
});

describe("safePct", () => {
  it("يقسّم ويقرّب طبيعياً", () => {
    expect(safePct(1, 3)).toBe(33);
    expect(safePct(3, 4)).toBe(75);
    expect(safePct(0, 10)).toBe(0);
  });

  it("لا قسمة على صفر: الإجمالي 0 يعطي 0", () => {
    expect(safePct(5, 0)).toBe(0);
    expect(safePct(0, 0)).toBe(0);
  });
});
