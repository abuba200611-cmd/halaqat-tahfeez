import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  lib/mosque/halaqat.ts — الدوال المباشرة التي حلّت محل نداءات /api/link/*
  بين الخادمين: تستدعي دوال قاعدة الحلقات الموجودة نفسها (listStudents،
  upsertStudent، getHalaqahMetrics) في العملية نفسها.
*/

vi.mock("@/lib/db", () => ({ listStudents: vi.fn(), upsertStudent: vi.fn() }));
vi.mock("@/lib/metrics-db", () => ({ getHalaqahMetrics: vi.fn() }));
vi.mock("@/lib/riyadh-date", () => ({ riyadhTodayISO: () => "2026-10-12" }));

import { listStudents, upsertStudent } from "@/lib/db";
import type { MemorizedRange, Student } from "@/lib/types";
import { getHalaqahMetrics } from "@/lib/metrics-db";
import { addStudentToHalaqah, getHalaqahRoster, getHalaqahStats, getMetricsForHalaqah } from "@/lib/mosque/halaqat";

const student = (id: string, name: string, ranges: MemorizedRange[], active = true): Student => ({
  id,
  name,
  group: "أ",
  ranges,
  mastery: { 1: 80, 2: 60 },
  active,
  rating: 0,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("getHalaqahStats", () => {
  it("النشطون فقط، بمتوسط محفوظ وإتقان مقرّب", async () => {
    vi.mocked(listStudents).mockResolvedValue([
      student("a", "أحمد", [{ from: 1, to: 10, monthsAgo: 0 }]),
      student("b", "بلال", [{ from: 1, to: 20, monthsAgo: 0 }]),
      student("c", "موقوف", [{ from: 1, to: 100, monthsAgo: 0 }], false),
    ]);
    const stats = await getHalaqahStats(42);
    expect(listStudents).toHaveBeenCalledWith(42);
    expect(stats.activeStudents).toBe(2);
    expect(stats.avgMastery).toBe(70);
    expect(stats).toMatchObject({ totalPages: 30, avgPages: 15 });
  });

  it("حلقة بلا طلاب: أصفار لا NaN", async () => {
    vi.mocked(listStudents).mockResolvedValue([]);
    expect(await getHalaqahStats(1)).toEqual({ activeStudents: 0, totalPages: 0, avgPages: 0, avgMastery: 0 });
  });
});

describe("getHalaqahRoster", () => {
  it("يرجع معرّف الطالب الحقيقي مع كل طالب (أساس الربط بلا مطابقة اسم)", async () => {
    vi.mocked(listStudents).mockResolvedValue([student("abc123", "أحمد", []), student("def456", "موقوف", [], false)]);
    const roster = await getHalaqahRoster({ id: 42, halaqahName: "الفجر", teacherName: "معلم" });
    expect(listStudents).toHaveBeenCalledWith(42);
    expect(roster.teacherName).toBe("معلم");
    expect(roster.students.map((s) => [s.id, s.name, s.active])).toEqual([
      ["abc123", "أحمد", true],
      ["def456", "موقوف", false],
    ]);
  });
});

describe("getMetricsForHalaqah", () => {
  const halaqah = { id: 42, halaqahName: "الفجر", teacherName: "معلم" };

  it("يفوّض لـ metrics-db بمعرّف الحلقة الحقيقي والنطاق واليوم", async () => {
    vi.mocked(getHalaqahMetrics).mockResolvedValue({ ok: true } as never);
    expect(await getMetricsForHalaqah(halaqah, "2026-10-01", "2026-10-07")).toEqual({ ok: true });
    expect(getHalaqahMetrics).toHaveBeenCalledWith(
      { id: 42, halaqahName: "الفجر", teacherName: "معلم" },
      { from: "2026-10-01", to: "2026-10-07" },
      "2026-10-12",
    );
  });

  it("نطاق غير صالح أو أطول من ١٢٠ يوماً = null بلا استعلام", async () => {
    expect(await getMetricsForHalaqah(halaqah, "2026-10-07", "2026-10-01")).toBeNull();
    expect(await getMetricsForHalaqah(halaqah, "2025-01-01", "2026-10-07")).toBeNull();
    expect(await getMetricsForHalaqah(halaqah, "bad", "2026-10-07")).toBeNull();
    expect(getHalaqahMetrics).not.toHaveBeenCalled();
  });
});

describe("addStudentToHalaqah", () => {
  it("ينشئ طالباً فعّالاً بمعرّف عشوائي بالحلقة ويرجع معرّفه", async () => {
    const id = await addStudentToHalaqah(42, "خالد");
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(upsertStudent).toHaveBeenCalledWith(42, {
      id,
      name: "خالد",
      group: "",
      ranges: [],
      mastery: {},
      active: true,
      rating: 0,
    });
  });

  it("معرّفان متتاليان مختلفان", async () => {
    expect(await addStudentToHalaqah(1, "أ")).not.toBe(await addStudentToHalaqah(1, "ب"));
  });
});
