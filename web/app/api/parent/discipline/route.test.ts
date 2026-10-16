import { beforeEach, describe, expect, it, vi } from "vitest";

const parentAuthMocks = vi.hoisted(() => ({
  currentParent: vi.fn(),
  parentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/parent-auth", () => parentAuthMocks);

const parentDbMocks = vi.hoisted(() => ({ getParentChild: vi.fn() }));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const disciplineMocks = vi.hoisted(() => ({
  disciplineContextForHalaqah: vi.fn(),
  listStudentEventsForParent: vi.fn(),
}));
vi.mock("@/lib/discipline-db", () => disciplineMocks);

const { GET } = await import("./route");

const parent = { id: 42, email: "w@example.com", name: "ولي", sessionVersion: 0 };
const child = { halaqahId: 3, studentId: "s1", studentName: "أحمد", halaqahName: "حلقة الفجر" };

const url = (halaqah: string, student: string) =>
  new Request(`http://localhost/api/parent/discipline?halaqah=${halaqah}&student=${encodeURIComponent(student)}`);

describe("GET /api/parent/discipline — ولي الأمر لا يرى إلا أحداث أبنائه", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parentAuthMocks.currentParent.mockResolvedValue(parent);
    parentDbMocks.getParentChild.mockResolvedValue(child);
    disciplineMocks.disciplineContextForHalaqah.mockResolvedValue({ mosqueId: 5, mosqueName: "جامع النور", config: {} });
    disciplineMocks.listStudentEventsForParent.mockResolvedValue([]);
  });

  it("بلا جلسة ولي: 401", async () => {
    parentAuthMocks.currentParent.mockResolvedValue(null);
    expect((await GET(url("3", "s1"))).status).toBe(401);
  });

  it("طالب ليس ابناً لهذا الولي: 404 متطابق ولا استعلام أحداث إطلاقاً", async () => {
    parentDbMocks.getParentChild.mockResolvedValue(null);
    const res = await GET(url("3", "foreign"));
    expect(res.status).toBe(404);
    expect(disciplineMocks.listStudentEventsForParent).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة بجامع الحلقة: 404 متطابق مع غير المرتبط", async () => {
    disciplineMocks.disciplineContextForHalaqah.mockResolvedValue(null);
    expect((await GET(url("3", "s1"))).status).toBe(404);
    expect(disciplineMocks.listStudentEventsForParent).not.toHaveBeenCalled();
  });

  it("الابن المرتبط: الأحداث تُجلب له وحده (حلقته وطالبه — لا معامل من العميل يحكم)", async () => {
    const res = await GET(url("99", "hacked"));
    expect(res.status).toBe(200);
    expect(disciplineMocks.listStudentEventsForParent).toHaveBeenCalledWith(3, "s1");
  });

  it("معاملات ناقصة أو غير رقمية: 404", async () => {
    expect((await GET(url("abc", "s1"))).status).toBe(404);
    expect((await GET(url("3", ""))).status).toBe(404);
    expect(disciplineMocks.listStudentEventsForParent).not.toHaveBeenCalled();
  });
});
