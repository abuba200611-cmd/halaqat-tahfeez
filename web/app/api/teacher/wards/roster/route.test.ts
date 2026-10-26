import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  001 T025 — GET /api/teacher/wards/roster: قائمة طلاب حلقة المعلّم مع حالة
  ورد اليوم (شارة «سُجِّل اليوم» وتالي التسجيل) — للابتدائي فقط، ولا يُرجَع
  أي حقل حساس (هاتف/ولي أمر/معرّفات داخلية).
*/

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "غير مصرّح" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ listStudentsWithTodayWard: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const stageDbMocks = vi.hoisted(() => ({ getHalaqahStage: vi.fn() }));
vi.mock("@/lib/halaqah-stage-db", () => stageDbMocks);

const { GET } = await import("./route");

describe("GET /api/teacher/wards/roster — قائمة تسجيل المعلّم (001 US2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue({ id: 2, halaqahId: 7, role: "assistant" as const });
    stageDbMocks.getHalaqahStage.mockResolvedValue("primary");
  });

  it("حلقة غير ابتدائية: 403 STAGE_NOT_PRIMARY ولا يُستعلم شيء", async () => {
    stageDbMocks.getHalaqahStage.mockResolvedValue("secondary");

    const res = await GET();
    const data = (await res.json()) as { code?: string };

    expect(res.status).toBe(403);
    expect(data.code).toBe("STAGE_NOT_PRIMARY");
    expect(dbMocks.listStudentsWithTodayWard).not.toHaveBeenCalled();
  });

  it("نجاح: طلاب الحلقة بترتيب القائمة مع recordedToday وملخّص اليوم — بلا أي حقل حساس", async () => {
    dbMocks.listStudentsWithTodayWard.mockResolvedValue([
      {
        id: "s1", name: "أحمد",
        todayWard: {
          id: 9, date: "2026-10-26", recordedVia: "teacher", status: "approved",
          hifz: { from: 603, to: 603 }, hifzAyah: { fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 },
        },
      },
      { id: "s2", name: "سعد", todayWard: null },
    ]);

    const res = await GET();
    const data = (await res.json()) as {
      stage: string;
      date: string;
      students: { id: string; name: string; recordedToday: boolean; lastSummary: string | null }[];
    };

    expect(res.status).toBe(200);
    expect(data.stage).toBe("primary");
    expect(data.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.students).toEqual([
      { id: "s1", name: "أحمد", recordedToday: true, lastSummary: expect.stringContaining("الفيل") },
      { id: "s2", name: "سعد", recordedToday: false, lastSummary: null },
    ]);
    // الاستعلام من جلسة المعلّم حصراً
    expect(dbMocks.listStudentsWithTodayWard).toHaveBeenCalledWith(7, data.date);
  });

  it("غير المسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
  });
});
