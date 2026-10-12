import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ getAttendanceSummaries: vi.fn() }));
vi.mock("@/lib/attendance-db", () => dbMocks);

const { GET } = await import("./route");

describe("GET /api/student/attendance — الطالب نفسه فقط (STEP 62)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("بلا جلسة: 401", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(dbMocks.getAttendanceSummaries).not.toHaveBeenCalled();
  });

  it("يقرأ بحلقة الطالب ومعرّفه من الجلسة فقط", async () => {
    authMocks.currentStudent.mockResolvedValue({ teacherId: 3, id: "s9", name: "x", halaqahName: "h" });
    const summary = { days: 1, present: 1, late: 0, excused: 0, absent: 0, presentPct: 100 };
    dbMocks.getAttendanceSummaries.mockResolvedValue({ s9: summary });
    const res = await GET();
    expect((await res.json()).summary).toEqual(summary);
    expect(dbMocks.getAttendanceSummaries).toHaveBeenCalledWith(3, expect.any(String), "s9");
  });
});
