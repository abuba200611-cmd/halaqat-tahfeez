import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  halaqahBuddyResetOnEdit: vi.fn(),
  setHalaqahBuddyResetOnEdit: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const { GET, PATCH } = await import("./route");

const SUPERVISOR = { id: 2, halaqahId: 7, role: "supervisor" as const };
const ASSISTANT = { id: 3, halaqahId: 7, role: "assistant" as const };

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/teacher/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/teacher/settings — القراءة لكل معلّمي الحلقة", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("يرجع الخيار الحالي ودور المستفسر (مساعد أو مشرف) لعرض الحالة", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    dbMocks.halaqahBuddyResetOnEdit.mockResolvedValue(true);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ buddyResetOnEdit: true, role: "assistant" });
    expect(dbMocks.halaqahBuddyResetOnEdit).toHaveBeenCalledWith(7);
  });

  it("غير المسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
  });
});

describe("PATCH /api/teacher/settings — التغيير لمشرف الحلقة فقط", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("المساعد: 403 ولا يغيّر الخيار إطلاقاً", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);

    const res = await PATCH(patchReq({ buddyResetOnEdit: true }));

    expect(res.status).toBe(403);
    expect(dbMocks.setHalaqahBuddyResetOnEdit).not.toHaveBeenCalled();
  });

  it("المشرف (المالك) بقيمة boolean: يغيّر خيار حلقه من الجلسة حصراً", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);

    const res = await PATCH(patchReq({ buddyResetOnEdit: true }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMocks.setHalaqahBuddyResetOnEdit).toHaveBeenCalledWith(7, true);
  });

  it("قيمة غير boolean (أو جسم فاسد): 400 بلا أي تغيير", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);

    const res = await PATCH(patchReq({ buddyResetOnEdit: "نعم" }));

    expect(res.status).toBe(400);
    expect(dbMocks.setHalaqahBuddyResetOnEdit).not.toHaveBeenCalled();
  });

  it("غير المسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);

    expect((await PATCH(patchReq({ buddyResetOnEdit: true }))).status).toBe(401);
  });
});
