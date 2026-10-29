import { describe, expect, it } from "vitest";
import { buildParentChildSummary, wardStatusCounts, type ParentWardRow } from "./parent-summary";
import type { WardLog } from "./types";

let nextId = 1;

function statusRow(status: ParentWardRow["status"]): ParentWardRow {
  return { date: "2026-03-20", hifz: null, review: null, status, recordedVia: "student", teacherNote: null };
}

function ward(overrides: Partial<WardLog>): WardLog {
  return {
    id: nextId++,
    studentId: "s1",
    studentName: "طالب",
    date: "2026-01-01",
    hifz: null,
    review: null,
    hifzAyah: null,
    reviewAyah: null,
    reviewSegments: null,
    reviewPagesTotal: 0,
    note: "",
    status: "new",
    createdAt: "2026-01-01 08:00:00",
    previousAttemptId: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    recordedByTeacherId: null,
    recordedVia: "student",
    ...overrides,
  };
}

describe("wardStatusCounts (دونات حالات أوراد ولي الأمر)", () => {
  it("يجمع حالات أوراد آخر ١٤ يوماً كما هي بلا فلترة", () => {
    const counts = wardStatusCounts([
      statusRow("approved"),
      statusRow("approved"),
      statusRow("needs_revision"),
      statusRow("new"),
    ]);
    expect(counts).toEqual([
      { status: "new", count: 1 },
      { status: "seen", count: 0 },
      { status: "approved", count: 2 },
      { status: "needs_revision", count: 1 },
    ]);
  });

  it("كل الحالات الأربع حاضرة دائماً ولو كانت صفراً", () => {
    expect(wardStatusCounts([])).toEqual([
      { status: "new", count: 0 },
      { status: "seen", count: 0 },
      { status: "approved", count: 0 },
      { status: "needs_revision", count: 0 },
    ]);
  });
});

describe("buildParentChildSummary — سلسلة الأوراد اليومية (مواصفة 003)", () => {
  it("٣٠ نقطة من أقدم يوم إلى اليوم، ووردان بنفس اليوم يجمعانه", () => {
    const today = "2026-03-30";
    const summary = buildParentChildSummary(
      [
        ward({ date: "2026-03-30", status: "approved" }),
        ward({ date: "2026-03-30", status: "new" }),
        ward({ date: "2026-03-28" }),
      ],
      today,
    );

    expect(summary.wardsDaily).toHaveLength(30);
    expect(summary.wardsDaily[0]).toEqual({ date: "2026-03-01", value: 0 });
    expect(summary.wardsDaily.at(-1)).toEqual({ date: today, value: 2 });
    expect(summary.wardsDaily.find((p) => p.date === "2026-03-28")?.value).toBe(1);
  });

  it("أورد خارج نافذة الثلاثين يوماً تُهمل — السلسلة لا تكسر", () => {
    const summary = buildParentChildSummary(
      [ward({ date: "2026-01-05" }), ward({ date: "2026-03-29" })],
      "2026-03-30",
    );
    expect(summary.wardsDaily.every((p) => p.value === (p.date === "2026-03-29" ? 1 : 0))).toBe(true);
  });

  it("لا أوراد = سلسلة أصفار كاملة (PanelEmpty عند العرض)", () => {
    const summary = buildParentChildSummary([], "2026-03-30");
    expect(summary.wardsDaily).toHaveLength(30);
    expect(summary.wardsDaily.every((p) => p.value === 0)).toBe(true);
  });
});
