import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);
const examsMocks = vi.hoisted(() => ({ listPublishedResultsForStudent: vi.fn() }));
vi.mock("@/lib/mosque/exams-db", () => examsMocks);
const mosqueMocks = vi.hoisted(() => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/mosque/db", () => mosqueMocks);
const feesMocks = vi.hoisted(() => ({ getMosqueIdForHalaqah: vi.fn() }));
vi.mock("@/lib/fees-db", () => feesMocks);

const { GET } = await import("./route");

describe("GET /api/student/exams — بوابة ميزة الاختبارات", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentStudent.mockResolvedValue({ id: "s1", teacherId: 3 });
    feesMocks.getMosqueIdForHalaqah.mockResolvedValue(5);
    mosqueMocks.isFeatureEnabled.mockResolvedValue(true);
    examsMocks.listPublishedResultsForStudent.mockResolvedValue([]);
  });

  it("الميزة مفعّلة: 200", async () => {
    expect((await GET()).status).toBe(200);
    expect(mosqueMocks.isFeatureEnabled).toHaveBeenCalledWith(5, "exams");
  });

  it("الميزة معطّلة: 404 ولا استعلام نتائج", async () => {
    mosqueMocks.isFeatureEnabled.mockResolvedValue(false);
    expect((await GET()).status).toBe(404);
    expect(examsMocks.listPublishedResultsForStudent).not.toHaveBeenCalled();
  });

  it("حلقة بلا جامع: 404", async () => {
    feesMocks.getMosqueIdForHalaqah.mockResolvedValue(null);
    expect((await GET()).status).toBe(404);
  });
});
