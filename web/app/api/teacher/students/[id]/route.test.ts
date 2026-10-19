import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B3 — GET /api/teacher/students/[id]: صفحة طالب عند المعلّم. طالب حلقة
  أخرى أو معرّف غير معروف = 404 ولا يُقرأ تاريخه إطلاقاً.
*/

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "غير مصرّح" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ listStudents: vi.fn(), listAllWardLogsForStudent: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const { GET } = await import("./route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = () => new Request("http://localhost/api/teacher/students/s9");

const TEACHER = { id: 2, halaqahId: 7 };

describe("GET /api/teacher/students/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(TEACHER);
  });

  it("بلا جلسة معلّم: 401 ولا قائمة أصلاً", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    const res = await GET(req(), ctx("s9"));
    expect(res.status).toBe(401);
    expect(dbMocks.listStudents).not.toHaveBeenCalled();
  });

  it("طالب ليس في حلقة المعلّم: 404 متطابقاً مع غير الموجود، ولا يُقرأ تاريخه", async () => {
    dbMocks.listStudents.mockResolvedValue([{ id: "s1", name: "آخر", group: "م" }]);
    const res = await GET(req(), ctx("s9"));
    expect(res.status).toBe(404);
    expect(dbMocks.listAllWardLogsForStudent).not.toHaveBeenCalled();
  });

  it("طالب الحلقة: تقدّمه وعدّاداته وآخر أوراده من تاريخه الكامل", async () => {
    dbMocks.listStudents.mockResolvedValue([{ id: "s9", name: "سعود", group: "المجموعة الأولى" }]);
    dbMocks.listAllWardLogsForStudent.mockResolvedValue([
      {
        id: 1, studentId: "s9", studentName: "سعود", date: "2026-11-01",
        hifz: { from: 1, to: 21 }, review: null, hifzAyah: null, reviewAyah: null,
        reviewSegments: [{ fromSurah: 67, fromAyah: 1, toSurah: 67, toAyah: 30 }],
        reviewSegmentTracks: ["sabqi"],
        reviewSegmentPages: [{ from: 562, to: 563 }],
        reviewPagesTotal: 2, note: "", status: "approved" as const,
        createdAt: "x", previousAttemptId: null, reviewedBy: null, reviewedAt: null, reviewNote: null, buddy: null,
      },
    ]);

    const res = await GET(req(), ctx("s9"));
    expect(res.status).toBe(200);
    expect(dbMocks.listAllWardLogsForStudent).toHaveBeenCalledWith(7, "s9");

    const body = (await res.json()) as {
      student: { id: string; name: string };
      progress: { pagesMemorized: number; cells: string[] };
      trackCounts: { days7: { sabqi: number }; days30: { sabqi: number } };
      wards: unknown[];
    };
    expect(body.student.name).toBe("سعود");
    expect(body.progress.pagesMemorized).toBe(21);
    expect(body.progress.cells[0]).toBe("memorized");
    expect(body.trackCounts.days30.sabqi).toBeGreaterThanOrEqual(0);
    expect(body.wards).toHaveLength(1);
  });
});
