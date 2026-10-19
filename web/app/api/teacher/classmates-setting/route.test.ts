import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  halaqahClassmatesVisible: vi.fn(),
  setHalaqahClassmatesVisible: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  rateLimited: vi.fn(() => Response.json({ error: "x" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

const { GET, PATCH } = await import("./route");

const SUPERVISOR = { id: 2, halaqahId: 7, role: "supervisor" as const };
const ASSISTANT = { id: 3, halaqahId: 7, role: "assistant" as const };

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/teacher/classmates-setting", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/teacher/classmates-setting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateMocks.checkRateLimit.mockResolvedValue(true);
  });

  it("GET: غير مسجّل 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("GET: يقرأ حالة حلقة الجلسة", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    dbMocks.halaqahClassmatesVisible.mockResolvedValue(true);
    expect(await (await GET()).json()).toEqual({ classmatesVisible: true, role: "assistant" });
    expect(dbMocks.halaqahClassmatesVisible).toHaveBeenCalledWith(7);
  });

  it("PATCH: غير معلّم 401 بلا تغيير", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await PATCH(patchReq({ classmatesVisible: true }))).status).toBe(401);
    expect(dbMocks.setHalaqahClassmatesVisible).not.toHaveBeenCalled();
  });

  it("PATCH: المساعد 403 بلا تغيير", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    expect((await PATCH(patchReq({ classmatesVisible: true }))).status).toBe(403);
    expect(dbMocks.setHalaqahClassmatesVisible).not.toHaveBeenCalled();
  });

  it("PATCH: المشرف يغيّر حلقته من الجلسة فقط (حتى لو أرسل halaqahId آخر)", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    const res = await PATCH(patchReq({ classmatesVisible: true, halaqahId: 99 }));
    expect(res.status).toBe(200);
    expect(dbMocks.setHalaqahClassmatesVisible).toHaveBeenCalledTimes(1);
    expect(dbMocks.setHalaqahClassmatesVisible).toHaveBeenCalledWith(7, true);
  });

  it("PATCH: قيمة غير boolean 400", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    expect((await PATCH(patchReq({ classmatesVisible: "yes" }))).status).toBe(400);
    expect(dbMocks.setHalaqahClassmatesVisible).not.toHaveBeenCalled();
  });

  it("PATCH: تجاوز الحد 429", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    rateMocks.checkRateLimit.mockResolvedValue(false);
    expect((await PATCH(patchReq({ classmatesVisible: true }))).status).toBe(429);
    expect(dbMocks.setHalaqahClassmatesVisible).not.toHaveBeenCalled();
  });
});
