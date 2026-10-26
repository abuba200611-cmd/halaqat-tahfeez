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

const stageDbMocks = vi.hoisted(() => ({ getHalaqahStage: vi.fn() }));
vi.mock("@/lib/halaqah-stage-db", () => stageDbMocks);

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
    stageDbMocks.getHalaqahStage.mockResolvedValue(null);
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

  it("يرجع فئة الحلقة ووحدتها (001 T022) — null تعني الوحدة الافتراضية", async () => {
    dbMocks.listAllWardLogsForStudent.mockResolvedValue([]);
    stageDbMocks.getHalaqahStage.mockResolvedValue("secondary");

    const res = await GET();
    const body = (await res.json()) as { stage: string | null; unit: string };

    expect(stageDbMocks.getHalaqahStage).toHaveBeenCalledWith(3);
    expect(body.stage).toBe("secondary");
    expect(body.unit).toBe("page_wajh");

    stageDbMocks.getHalaqahStage.mockResolvedValue(null);
    const legacy = await GET();
    const legacyBody = (await legacy.json()) as { stage: string | null; unit: string };
    expect(legacyBody.stage).toBeNull();
    expect(legacyBody.unit).toBe("ayah_page");
  });
});
