import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  001 T019 — PATCH /api/mosques/[id]/halaqahs/[halaqahId]/stage: مدير الجامع
  يحدّد فئة حلقة من حلقات جامعه فقط (FR-002) — الحلقة تتبع الجامع وإلا
  404 متطابقة مع غير الموجودة، وكل تغيير يُسجَّل بحدث أمان mosque_admin.
*/

const accessMocks = vi.hoisted(() => ({ canAccessMosque: vi.fn(async () => true) }));
vi.mock("@/lib/mosque/access", () => accessMocks);

const adminAuthMocks = vi.hoisted(() => ({
  unauthorized: vi.fn(() => Response.json({ error: "غير مصرّح" }, { status: 401 })),
}));
vi.mock("@/lib/mosque/admin-auth", () => adminAuthMocks);

const mosqueAuthMocks = vi.hoisted(() => ({
  currentMosqueAdmin: vi.fn(async () => ({ id: 11, mosqueId: 5 })),
}));
vi.mock("@/lib/mosque-auth", () => mosqueAuthMocks);

const mosqueDbMocks = vi.hoisted(() => ({
  getMosque: vi.fn(async () => ({ id: 5, name: "جامع", city: "", createdAt: "" })),
  getHalaqah: vi.fn(),
}));
vi.mock("@/lib/mosque/db", () => mosqueDbMocks);

const stageDbMocks = vi.hoisted(() => ({
  getHalaqahStage: vi.fn(async () => "intermediate"),
  setHalaqahStage: vi.fn(async () => true),
}));
vi.mock("@/lib/halaqah-stage-db", () => stageDbMocks);

const auditMocks = vi.hoisted(() => ({ logSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit-log", () => auditMocks);

const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

const { PATCH } = await import("./route");

function patchReq(mosqueId: number, halaqahId: number, body: unknown): Request {
  return new Request(`http://localhost/api/mosques/${mosqueId}/halaqahs/${halaqahId}/stage`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PARAMS = (mosqueId: string, halaqahId: string) => ({ params: Promise.resolve({ id: mosqueId, halaqahId }) });

describe("PATCH /api/mosques/:id/halaqahs/:halaqahId/stage — فئة حلقة الجامع (001 US1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mosqueDbMocks.getHalaqah.mockResolvedValue({
      id: 9, mosqueId: 5, halaqahName: "حلقة", teacherName: "معلّم", createdAt: "",
    });
  });

  it("مدير الجامع يغيّر فئة حلقة من حلقات جامعه: يحدّثها ويسجّل حدث mosque_admin ويرجّع الفئة", async () => {
    const res = await PATCH(patchReq(5, 9, { stage: "primary" }), PARAMS("5", "9"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stage: "primary" });
    expect(stageDbMocks.setHalaqahStage).toHaveBeenCalledWith(9, "primary");
    expect(rateLimitMocks.checkRateLimit).toHaveBeenCalledWith("halaqah-stage:5", 60, 3600);
    expect(auditMocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "halaqah.stage_change",
        actorKind: "mosque_admin",
        actorId: 11,
        details: { mosqueId: 5, halaqahId: 9, from: "intermediate", to: "primary" },
      }),
    );
  });

  it("حلقة جامع آخر: 404 — لا فرق عن غير الموجودة، ولا تحديث ولا حدث", async () => {
    mosqueDbMocks.getHalaqah.mockResolvedValue({
      id: 9, mosqueId: 77, halaqahName: "حلقة", teacherName: "معلّم", createdAt: "",
    });

    const res = await PATCH(patchReq(5, 9, { stage: "primary" }), PARAMS("5", "9"));

    expect(res.status).toBe(404);
    expect(stageDbMocks.setHalaqahStage).not.toHaveBeenCalled();
    expect(auditMocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it("حلقة غير موجودة أصلاً: 404", async () => {
    mosqueDbMocks.getHalaqah.mockResolvedValue(null);

    const res = await PATCH(patchReq(5, 9, { stage: "primary" }), PARAMS("5", "9"));

    expect(res.status).toBe(404);
  });

  it("بلا صلاحية على الجامع: 401", async () => {
    accessMocks.canAccessMosque.mockResolvedValueOnce(false);

    const res = await PATCH(patchReq(5, 9, { stage: "primary" }), PARAMS("5", "9"));

    expect(res.status).toBe(401);
    expect(stageDbMocks.setHalaqahStage).not.toHaveBeenCalled();
  });

  it("فئة غير صالحة: 400 بلا تغيير", async () => {
    const res = await PATCH(patchReq(5, 9, { stage: "kg" }), PARAMS("5", "9"));

    expect(res.status).toBe(400);
    expect(stageDbMocks.setHalaqahStage).not.toHaveBeenCalled();
  });

  it("stage=null مسموح (إرجاع للنمط الافتراضي)", async () => {
    const res = await PATCH(patchReq(5, 9, { stage: null }), PARAMS("5", "9"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, stage: null });
    expect(stageDbMocks.setHalaqahStage).toHaveBeenCalledWith(9, null);
  });

  it("تجاوز حدّ المعدّل (60/ساعة لكل جامع): 429", async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce(false);

    const res = await PATCH(patchReq(5, 9, { stage: "primary" }), PARAMS("5", "9"));

    expect(res.status).toBe(429);
    expect(stageDbMocks.setHalaqahStage).not.toHaveBeenCalled();
  });

  it("معرّف غير رقمي: 404", async () => {
    const res = await PATCH(patchReq(5, 9, { stage: "primary" }), PARAMS("abc", "9"));

    expect(res.status).toBe(404);
  });
});
