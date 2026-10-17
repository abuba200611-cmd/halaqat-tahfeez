import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  disciplineContextForHalaqah: vi.fn(),
  getMonthlySheetData: vi.fn(),
  submitSheet: vi.fn(async () => undefined),
  reopenSheet: vi.fn(),
}));
vi.mock("@/lib/discipline-db", () => dbMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "limit" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const { GET, POST } = await import("./route");

const teacher = { id: 7, halaqahId: 3, halaqahName: "حلقة الفجر", role: "supervisor" as const };
const ctx = { mosqueId: 5, mosqueName: "جامع النور", config: { absence: {}, violations: {} } };

const post = (body: unknown) =>
  new Request("http://localhost/api/discipline/sheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET /api/discipline/sheet — كشف المتابعة", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(teacher);
    dbMocks.disciplineContextForHalaqah.mockResolvedValue(ctx);
    dbMocks.getMonthlySheetData.mockResolvedValue({ month: "1448-04", students: [], status: "draft" });
  });

  it("شهر غير صحيح: 400", async () => {
    for (const month of ["", "1448-4", "1448-13", "abc", undefined]) {
      const url = `http://localhost/api/discipline/sheet${month ? `?month=${month}` : ""}`;
      expect((await GET(new Request(url))).status).toBe(400);
    }
    expect(dbMocks.getMonthlySheetData).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة: 404", async () => {
    dbMocks.disciplineContextForHalaqah.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/discipline/sheet?month=1448-04"))).status).toBe(404);
  });

  it("الحساب لحلقة الجلسة لا لغيرها", async () => {
    const res = await GET(new Request("http://localhost/api/discipline/sheet?month=1448-04"));
    expect(res.status).toBe(200);
    expect(dbMocks.getMonthlySheetData).toHaveBeenCalledWith(3, "1448-04", expect.anything());
  });
});

describe("POST /api/discipline/sheet — التسليم", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(teacher);
    dbMocks.disciplineContextForHalaqah.mockResolvedValue(ctx);
  });

  it("تسليم: يخزّن الحالة والملاحظات ومعرّف المعلّم لحلقة الجلسة", async () => {
    const res = await POST(post({ month: "1448-04", action: "submit", notes: "  شهر جيد  " }));
    expect(res.status).toBe(200);
    expect(dbMocks.submitSheet).toHaveBeenCalledWith({ halaqahId: 3, month: "1448-04", notes: "شهر جيد", teacherId: 7 });
  });

  it("فتح كشف مُسلَّم: يُسمح؛ كشف مراجَع أو غير مُسلَّم: يُرفض 400", async () => {
    dbMocks.reopenSheet.mockResolvedValueOnce(true).mockResolvedValue(false);
    expect((await POST(post({ month: "1448-04", action: "reopen" }))).status).toBe(200);
    expect((await POST(post({ month: "1448-04", action: "reopen" }))).status).toBe(400);
  });

  it("إجراء مجهول أو شهر فاسد: 400 بلا كتابة", async () => {
    expect((await POST(post({ month: "1448-04", action: "delete" }))).status).toBe(400);
    expect((await POST(post({ month: "x", action: "submit" }))).status).toBe(400);
    expect(dbMocks.submitSheet).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة: 404", async () => {
    dbMocks.disciplineContextForHalaqah.mockResolvedValue(null);
    expect((await POST(post({ month: "1448-04", action: "submit" }))).status).toBe(404);
  });
});
