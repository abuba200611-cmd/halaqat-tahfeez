import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "يجب على الطالب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ listHalaqahMates: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const { GET } = await import("./route");

const FAKE_STUDENT = { teacherId: 1, id: "s1", name: "أحمد", halaqahName: "حلقة" };

describe("GET /api/wards/buddies — زملاء الحلقة للاختيار (STEP 56)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("بلا جلسة طالب: 401", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(dbMocks.listHalaqahMates).not.toHaveBeenCalled();
  });

  it("يرجع زملاء الحلقة مستبعداً الطالب نفسه ضمناً عبر listHalaqahMates(teacherId, selfId)", async () => {
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    dbMocks.listHalaqahMates.mockResolvedValue([{ id: "s2", name: "محمد" }]);

    const res = await GET();
    const data = (await res.json()) as { mates: unknown };

    expect(res.status).toBe(200);
    expect(data).toEqual({ mates: [{ id: "s2", name: "محمد" }] });
    expect(dbMocks.listHalaqahMates).toHaveBeenCalledWith(1, "s1");
  });
});
