import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ getStudentPlanView: vi.fn() }));
vi.mock("@/lib/plan-db", () => dbMocks);

const { GET } = await import("./route");

describe("GET /api/student/plan (STEP 63)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("بلا جلسة: 401", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(dbMocks.getStudentPlanView).not.toHaveBeenCalled();
  });

  it("الهوية من الجلسة فقط", async () => {
    authMocks.currentStudent.mockResolvedValue({ teacherId: 3, id: "s9" });
    dbMocks.getStudentPlanView.mockResolvedValue({ plan: null });
    expect((await GET()).status).toBe(200);
    expect(dbMocks.getStudentPlanView).toHaveBeenCalledWith(3, "s9", expect.any(String), expect.any(String));
  });
});
