import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "يجب على الطالب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  listPendingBuddyRequestsForStudent: vi.fn(),
  respondToBuddyRequest: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const { GET, PATCH } = await import("./route");

const FAKE_STUDENT = { teacherId: 1, id: "s2", name: "محمد", halaqahName: "حلقة" };

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/wards/buddy-requests", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/wards/buddy-requests (STEP 56)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("بلا جلسة: 401", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("يرجع فقط اسم الطالب الطالب والتاريخ — لا شيء من ورده", async () => {
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    dbMocks.listPendingBuddyRequestsForStudent.mockResolvedValue([
      { wardLogId: 5, requesterName: "أحمد", date: "2026-09-29" },
    ]);
    const res = await GET();
    expect(await res.json()).toEqual({ requests: [{ wardLogId: 5, requesterName: "أحمد", date: "2026-09-29" }] });
  });
});

describe("PATCH /api/wards/buddy-requests — تأكيد/رفض (STEP 56)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
  });

  it("بلا جلسة: 401", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    const res = await PATCH(patchReq({ wardLogId: 5, action: "confirm" }));
    expect(res.status).toBe(401);
  });

  it("معرّف ورد غير صحيح: 400", async () => {
    const res = await PATCH(patchReq({ wardLogId: "x", action: "confirm" }));
    expect(res.status).toBe(400);
  });

  it("إجراء غير صحيح: 400", async () => {
    const res = await PATCH(patchReq({ wardLogId: 5, action: "approve" }));
    expect(res.status).toBe(400);
  });

  it("طالب ثالث (ليس buddy_student_id المقصود) أو طلب مُجاب عليه مسبقاً: respondToBuddyRequest ترجع false → 404", async () => {
    dbMocks.respondToBuddyRequest.mockResolvedValue(false);
    const res = await PATCH(patchReq({ wardLogId: 5, action: "confirm" }));
    expect(res.status).toBe(404);
  });

  it("تأكيد صحيح: respondToBuddyRequest(teacherId, studentId, wardLogId, true) → 200", async () => {
    dbMocks.respondToBuddyRequest.mockResolvedValue(true);
    const res = await PATCH(patchReq({ wardLogId: 5, action: "confirm" }));
    expect(res.status).toBe(200);
    expect(dbMocks.respondToBuddyRequest).toHaveBeenCalledWith(1, "s2", 5, true);
  });

  it("رفض صحيح: accept=false", async () => {
    dbMocks.respondToBuddyRequest.mockResolvedValue(true);
    const res = await PATCH(patchReq({ wardLogId: 5, action: "decline" }));
    expect(res.status).toBe(200);
    expect(dbMocks.respondToBuddyRequest).toHaveBeenCalledWith(1, "s2", 5, false);
  });

  it("تأكيد مرتين: الثانية ترجع 404 (respondToBuddyRequest ترجع false لعدم وجود صف pending بعد الآن)", async () => {
    dbMocks.respondToBuddyRequest.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const first = await PATCH(patchReq({ wardLogId: 5, action: "confirm" }));
    const second = await PATCH(patchReq({ wardLogId: 5, action: "confirm" }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(404);
  });
});
