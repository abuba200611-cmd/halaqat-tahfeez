import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentParent: vi.fn(),
  parentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/parent-auth", () => authMocks);

const parentDbMocks = vi.hoisted(() => ({ getParentChild: vi.fn() }));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const dbMocks = vi.hoisted(() => ({ listAllWardLogsForStudent: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const reviewTrackMocks = vi.hoisted(() => ({ reviewTrackConfigForHalaqah: vi.fn() }));
vi.mock("@/lib/mosque/review-tracks-db", () => reviewTrackMocks);

const { GET } = await import("./route");

const req = (qs: string) => new Request(`http://localhost/api/parent/child?${qs}`);

describe("GET /api/parent/child — قراءة الأبناء المرتبطين فقط", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentParent.mockResolvedValue({ id: 5, name: "أب", email: "a@b.c", sessionVersion: 0 });
    reviewTrackMocks.reviewTrackConfigForHalaqah.mockResolvedValue({ enabled: true, kubraPages: 10, naming: "standard" });
  });

  it("بلا جلسة: 401 ولا قراءة بيانات", async () => {
    authMocks.currentParent.mockResolvedValue(null);
    const res = await GET(req("halaqah=1&student=s1"));
    expect(res.status).toBe(401);
    expect(dbMocks.listAllWardLogsForStudent).not.toHaveBeenCalled();
  });

  it("ابن غير مرتبط بهذا الولي: 404 ولا تُقرأ أوراده إطلاقاً", async () => {
    parentDbMocks.getParentChild.mockResolvedValue(null);
    const res = await GET(req("halaqah=1&student=other"));
    expect(res.status).toBe(404);
    expect(parentDbMocks.getParentChild).toHaveBeenCalledWith(5, 1, "other");
    expect(dbMocks.listAllWardLogsForStudent).not.toHaveBeenCalled();
  });

  it("معاملات ناقصة: 404 بلا استعلام", async () => {
    const res = await GET(req("halaqah=abc"));
    expect(res.status).toBe(404);
    expect(parentDbMocks.getParentChild).not.toHaveBeenCalled();
  });

  it("ابن مرتبط: 200 بملخّص محسوب بلا ملاحظات المعلّم أو معرّفات داخلية", async () => {
    parentDbMocks.getParentChild.mockResolvedValue({
      halaqahId: 1,
      studentId: "s1",
      studentName: "أحمد",
      halaqahName: "حلقة",
    });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
    dbMocks.listAllWardLogsForStudent.mockResolvedValue([
      {
        id: 1, studentId: "s1", studentName: "أحمد", date: today,
        hifz: { from: 1, to: 2 }, review: null, hifzAyah: null, reviewAyah: null, reviewSegments: null,
        note: "سرّ", status: "approved", createdAt: "x", previousAttemptId: null,
        reviewedBy: 2, reviewedAt: null, reviewNote: "ملاحظة المعلّم", buddy: null,
      },
    ]);

    const res = await GET(req("halaqah=1&student=s1"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.child.name).toBe("أحمد");
    expect(body.summary.pagesCovered).toBe(2);
    expect(body.summary.wards).toHaveLength(1);
    const text = JSON.stringify(body);
    expect(text).not.toContain("ملاحظة المعلّم");
    expect(text).not.toContain("سرّ");
    expect(dbMocks.listAllWardLogsForStudent).toHaveBeenCalledWith(1, "s1");
  });
});
