import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B3 — GET /api/student/progress: تقدّم الأجزاء وعدّادات المسارات للطالب
  نفسه فقط — المعرّفان (الحلقة والطالب) من الجلسة حصراً.
*/

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ listAllWardLogsForStudent: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const reviewTrackMocks = vi.hoisted(() => ({ reviewTrackConfigForHalaqah: vi.fn() }));
vi.mock("@/lib/mosque/review-tracks-db", () => reviewTrackMocks);

const { GET } = await import("./route");

function wardLog(date: string, hifzFrom: number, hifzTo: number) {
  return {
    id: 1, studentId: "s1", studentName: "طالب", date,
    hifz: { from: hifzFrom, to: hifzTo }, review: null, hifzAyah: null, reviewAyah: null,
    reviewSegments: null, reviewPagesTotal: 0, note: "", status: "approved" as const,
    createdAt: "x", previousAttemptId: null, reviewedBy: null, reviewedAt: null, reviewNote: null, buddy: null,
  };
}

describe("GET /api/student/progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentStudent.mockResolvedValue({ teacherId: 3, id: "s1", name: "طالب", halaqahName: "ح" });
    reviewTrackMocks.reviewTrackConfigForHalaqah.mockResolvedValue({ enabled: true, kubraPages: 10, naming: "standard" });
  });

  it("بلا جلسة: 401 ولا قراءة تاريخ", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(dbMocks.listAllWardLogsForStudent).not.toHaveBeenCalled();
  });

  it("يقرأ تاريخ الطالب نفسه من الجلسة حصراً — لا معامل من الاستعلام أصلاً", async () => {
    dbMocks.listAllWardLogsForStudent.mockResolvedValue([wardLog("2026-11-01", 1, 21), wardLog("2026-11-02", 22, 41)]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(dbMocks.listAllWardLogsForStudent).toHaveBeenCalledWith(3, "s1");

    const body = (await res.json()) as {
      progress: { pagesMemorized: number; juzFraction: number; cells: string[] };
      trackCounts: { days7: object; days30: object };
    };
    expect(body.progress.pagesMemorized).toBe(41);
    expect(body.progress.cells[0]).toBe("memorized");
    expect(body.progress.cells[1]).toBe("memorized");
    expect(body.progress.cells[2]).toBe("not_started");
    expect(body.trackCounts).toBeDefined();
  });
});
