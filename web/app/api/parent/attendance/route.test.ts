import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentParent: vi.fn(),
  parentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/parent-auth", () => authMocks);

const parentDbMocks = vi.hoisted(() => ({ getParentChild: vi.fn() }));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const dbMocks = vi.hoisted(() => ({ getAttendanceSummaries: vi.fn() }));
vi.mock("@/lib/attendance-db", () => dbMocks);

const { GET } = await import("./route");
const req = (qs: string) => new Request(`http://localhost/api/parent/attendance?${qs}`);

describe("GET /api/parent/attendance — الأبناء المرتبطون فقط (STEP 62)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentParent.mockResolvedValue({ id: 5 });
  });

  it("بلا جلسة: 401", async () => {
    authMocks.currentParent.mockResolvedValue(null);
    expect((await GET(req("halaqah=1&student=s1"))).status).toBe(401);
    expect(dbMocks.getAttendanceSummaries).not.toHaveBeenCalled();
  });

  it("ابن غير مرتبط: 404 ولا قراءة حضور", async () => {
    parentDbMocks.getParentChild.mockResolvedValue(null);
    expect((await GET(req("halaqah=1&student=other"))).status).toBe(404);
    expect(parentDbMocks.getParentChild).toHaveBeenCalledWith(5, 1, "other");
    expect(dbMocks.getAttendanceSummaries).not.toHaveBeenCalled();
  });

  it("ابن مرتبط: ملخّصه هو فقط", async () => {
    parentDbMocks.getParentChild.mockResolvedValue({ halaqahId: 1, studentId: "s1" });
    const summary = { days: 3, present: 2, late: 0, excused: 0, absent: 1, presentPct: 67 };
    dbMocks.getAttendanceSummaries.mockResolvedValue({ s1: summary });
    const res = await GET(req("halaqah=1&student=s1"));
    expect(res.status).toBe(200);
    expect((await res.json()).summary).toEqual(summary);
    expect(dbMocks.getAttendanceSummaries).toHaveBeenCalledWith(1, expect.any(String), "s1");
  });
});
