import { beforeEach, describe, expect, it, vi } from "vitest";

const parentAuthMocks = vi.hoisted(() => ({
  currentParent: vi.fn(),
  parentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/parent-auth", () => parentAuthMocks);
vi.mock("@/lib/parent-db", () => ({ getParentChild: vi.fn() }));
const examsMocks = vi.hoisted(() => ({ listPublishedResultsForStudent: vi.fn() }));
vi.mock("@/lib/mosque/exams-db", () => examsMocks);
const mosqueMocks = vi.hoisted(() => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/mosque/db", () => mosqueMocks);
const feesMocks = vi.hoisted(() => ({ getMosqueIdForHalaqah: vi.fn() }));
vi.mock("@/lib/fees-db", () => feesMocks);

const { getParentChild } = await import("@/lib/parent-db");
const { GET } = await import("./route");

const req = () => new Request("http://localhost/api/parent/exams?halaqah=3&student=s1");

describe("GET /api/parent/exams — بوابة ميزة الاختبارات", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthMocks.currentParent.mockResolvedValue({ id: 1 });
    vi.mocked(getParentChild).mockResolvedValue({ halaqahId: 3, studentId: "s1" } as never);
    feesMocks.getMosqueIdForHalaqah.mockResolvedValue(5);
    mosqueMocks.isFeatureEnabled.mockResolvedValue(true);
    examsMocks.listPublishedResultsForStudent.mockResolvedValue([]);
  });

  it("الميزة مفعّلة: 200", async () => {
    expect((await GET(req())).status).toBe(200);
  });

  it("الميزة معطّلة: 404 ولا استعلام نتائج", async () => {
    mosqueMocks.isFeatureEnabled.mockResolvedValue(false);
    expect((await GET(req())).status).toBe(404);
    expect(examsMocks.listPublishedResultsForStudent).not.toHaveBeenCalled();
  });
});
