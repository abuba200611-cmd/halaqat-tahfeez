import { describe, expect, it } from "vitest";
import { buildParentChildSummary } from "./parent-summary";
import type { WardLog } from "./types";

const ward = (over: Partial<WardLog>): WardLog =>
  ({
    id: 1,
    studentId: "s1",
    studentName: "x",
    date: "2026-10-18",
    hifz: { from: 1, to: 2 },
    review: null,
    hifzAyah: null,
    reviewAyah: null,
    reviewSegments: null,
    reviewPagesTotal: 0,
    note: "",
    status: "approved",
    createdAt: "2026-10-18 10:00:00",
    previousAttemptId: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    ...over,
  }) as WardLog;

describe("ملخص ولي الأمر — درجة نقاط الأخطاء", () => {
  it("يعرض الدرجة والتقدير فقط، ولا يسرّب العدّادات", () => {
    const summary = buildParentChildSummary(
      [ward({ errorScore: 93, errorBand: "ممتاز", errorCounts: { hifz: 3, tajweed: 2 } })],
      "2026-10-19",
    );
    expect(summary.wards[0]).toMatchObject({ score: 93, band: "ممتاز" });
    expect(JSON.stringify(summary.wards[0])).not.toContain("hifz\":3");
    expect(summary.wards[0]).not.toHaveProperty("errorCounts");
  });

  it("ورد غير مُقيَّم بالنقاط: لا score ولا band", () => {
    const summary = buildParentChildSummary([ward({})], "2026-10-19");
    expect(summary.wards[0]).not.toHaveProperty("score");
    expect(summary.wards[0]).not.toHaveProperty("band");
  });
});
