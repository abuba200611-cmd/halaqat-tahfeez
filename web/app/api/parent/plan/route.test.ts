import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentParent: vi.fn(),
  parentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/parent-auth", () => authMocks);

const parentDbMocks = vi.hoisted(() => ({ getParentChild: vi.fn() }));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const dbMocks = vi.hoisted(() => ({ getStudentPlanView: vi.fn() }));
vi.mock("@/lib/plan-db", () => dbMocks);

const { GET } = await import("./route");
const req = (qs: string) => new Request(`http://localhost/api/parent/plan?${qs}`);

describe("GET /api/parent/plan — الأبناء المرتبطون فقط (STEP 63)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentParent.mockResolvedValue({ id: 5 });
  });

  it("بلا جلسة: 401", async () => {
    authMocks.currentParent.mockResolvedValue(null);
    expect((await GET(req("halaqahId=1&studentId=s1"))).status).toBe(401);
    expect(dbMocks.getStudentPlanView).not.toHaveBeenCalled();
  });

  it("ابن غير مرتبط: 404 ولا قراءة خطة", async () => {
    parentDbMocks.getParentChild.mockResolvedValue(null);
    expect((await GET(req("halaqahId=1&studentId=other"))).status).toBe(404);
    expect(parentDbMocks.getParentChild).toHaveBeenCalledWith(5, 1, "other");
    expect(dbMocks.getStudentPlanView).not.toHaveBeenCalled();
  });

  it("معاملات ناقصة أو غير رقمية: 404", async () => {
    expect((await GET(req("studentId=s1"))).status).toBe(404);
    expect((await GET(req("halaqahId=abc&studentId=s1"))).status).toBe(404);
    expect(dbMocks.getStudentPlanView).not.toHaveBeenCalled();
  });

  it("ابن مرتبط: خطته هو فقط", async () => {
    parentDbMocks.getParentChild.mockResolvedValue({ halaqahId: 1, studentId: "s1" });
    dbMocks.getStudentPlanView.mockResolvedValue({ month: "1448-05", plan: null });
    const res = await GET(req("halaqahId=1&studentId=s1"));
    expect(res.status).toBe(200);
    expect((await res.json()).plan.month).toBe("1448-05");
    expect(dbMocks.getStudentPlanView).toHaveBeenCalledWith(1, "s1", expect.stringMatching(/^\d{4}-\d{2}$/), expect.any(String));
  });
});
