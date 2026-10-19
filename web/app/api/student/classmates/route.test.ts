import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  halaqahClassmatesVisible: vi.fn(),
  listClassmateNames: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const { GET } = await import("./route");
const { GET: STATUS } = await import("./status/route");

describe("GET /api/student/classmates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("بلا جلسة: 401", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(dbMocks.listClassmateNames).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة: 403 ولا تُقرأ أي أسماء", async () => {
    authMocks.currentStudent.mockResolvedValue({ teacherId: 3, id: "s1" });
    dbMocks.halaqahClassmatesVisible.mockResolvedValue(false);
    const res = await GET();
    expect(res.status).toBe(403);
    expect(dbMocks.listClassmateNames).not.toHaveBeenCalled();
  });

  it("مفعّلة: أسماء حلقة الجلسة فقط وبلا حقول خاصة", async () => {
    authMocks.currentStudent.mockResolvedValue({ teacherId: 3, id: "s1", name: "أحمد", halaqahName: "حلقة" });
    dbMocks.halaqahClassmatesVisible.mockResolvedValue(true);
    dbMocks.listClassmateNames.mockResolvedValue(["أحمد", "بلال"]);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(dbMocks.halaqahClassmatesVisible).toHaveBeenCalledWith(3);
    expect(dbMocks.listClassmateNames).toHaveBeenCalledWith(3);
    const body = await res.json();
    expect(body).toEqual({ classmates: [{ name: "أحمد" }, { name: "بلال" }] });
    const text = JSON.stringify(body);
    for (const field of ["phone", "email", "parent", "grade", "attendance", "username", "id", "teacherId"]) {
      expect(text).not.toContain(`"${field}"`);
    }
  });

  it("status: يعكس تفعيل حلقة الجلسة فقط", async () => {
    authMocks.currentStudent.mockResolvedValue({ teacherId: 5, id: "s2" });
    dbMocks.halaqahClassmatesVisible.mockResolvedValue(true);
    const res = await STATUS();
    expect(await res.json()).toEqual({ enabled: true });
    expect(dbMocks.halaqahClassmatesVisible).toHaveBeenCalledWith(5);
  });
});
