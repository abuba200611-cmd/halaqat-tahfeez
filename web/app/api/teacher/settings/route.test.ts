import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  إعدادات الحلقة + فئتها العمرية (001 T018): القراءة لكل معلّمي الحلقة،
  وتغيير الفئة لمشرف الحلقة فقط مع حدث تدقيق halaqah.stage_change (FR-001/FR-002).
*/

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

const stageDbMocks = vi.hoisted(() => ({
  getHalaqahStage: vi.fn(),
  setHalaqahStage: vi.fn(),
}));
vi.mock("@/lib/halaqah-stage-db", () => stageDbMocks);

const reviewTracksMocks = vi.hoisted(() => ({
  reviewTrackConfigForHalaqah: vi.fn(),
}));
vi.mock("@/lib/mosque/review-tracks-db", () => reviewTracksMocks);

const auditMocks = vi.hoisted(() => ({ logSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit-log", () => auditMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

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
    reviewTracksMocks.reviewTrackConfigForHalaqah.mockResolvedValue({ enabled: true });
  });

  it("يرجع الخيار الحالي ودور المستفسر (مساعد أو مشرف) لعرض الحالة", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    dbMocks.halaqahBuddyResetOnEdit.mockResolvedValue(true);
    stageDbMocks.getHalaqahStage.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.buddyResetOnEdit).toBe(true);
    expect(data.role).toBe("assistant");
    expect(dbMocks.halaqahBuddyResetOnEdit).toHaveBeenCalledWith(7);
  });

  it("حلقة ابتدائي: يرجع stage وstageProfile بملف الفئة (pointsEnabled/reviewTracksVisible محسوبان خادمياً)", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);
    dbMocks.halaqahBuddyResetOnEdit.mockResolvedValue(false);
    stageDbMocks.getHalaqahStage.mockResolvedValue("primary");

    const res = await GET();
    const data = (await res.json()) as {
      stage: string;
      stageProfile: { stage: string; unit: string; teacherRecords: boolean; pointsEnabled: boolean; reviewTracksVisible: boolean };
    };

    expect(res.status).toBe(200);
    expect(data.stage).toBe("primary");
    expect(data.stageProfile).toEqual({
      stage: "primary",
      unit: "surah_ayah",
      teacherRecords: true,
      pointsEnabled: true,
      reviewTracksVisible: false,
    });
  });

  it("حلقة بلا فئة: stage=null وملف legacy (لا تسجيل معلّم، لا نقاط، كبرى/صغرى ظاهرة)", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    dbMocks.halaqahBuddyResetOnEdit.mockResolvedValue(false);
    stageDbMocks.getHalaqahStage.mockResolvedValue(null);

    const res = await GET();
    const data = (await res.json()) as {
      stage: string | null;
      stageProfile: { stage: string; unit: string; teacherRecords: boolean; pointsEnabled: boolean; reviewTracksVisible: boolean };
    };

    expect(res.status).toBe(200);
    expect(data.stage).toBeNull();
    expect(data.stageProfile.stage).toBe("legacy");
    expect(data.stageProfile.unit).toBe("ayah_page");
    expect(data.stageProfile.teacherRecords).toBe(false);
    expect(data.stageProfile.pointsEnabled).toBe(false);
    expect(data.stageProfile.reviewTracksVisible).toBe(true);
  });

  it("جامع معطّل الكبرى/الصغرى يخفيها حتى للفئات التي تستخدمها", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    dbMocks.halaqahBuddyResetOnEdit.mockResolvedValue(false);
    stageDbMocks.getHalaqahStage.mockResolvedValue("secondary");
    reviewTracksMocks.reviewTrackConfigForHalaqah.mockResolvedValue({ enabled: false });

    const res = await GET();
    const data = (await res.json()) as { stageProfile: { reviewTracksVisible: boolean } };

    expect(data.stageProfile.reviewTracksVisible).toBe(false);
  });

  it("غير المسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);

    expect((await GET()).status).toBe(401);
  });
});

describe("PATCH /api/teacher/settings — التغيير لمشرف الحلقة فقط", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageDbMocks.getHalaqahStage.mockResolvedValue(null);
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

describe("PATCH /api/teacher/settings — فئة الحلقة (001 T018، FR-002)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stageDbMocks.getHalaqahStage.mockResolvedValue(null);
  });

  it("المشرف يغيّر الفئة: يحدّثها ويسجّل حدث التدقيق with from/to", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    stageDbMocks.getHalaqahStage.mockResolvedValue("intermediate");

    const res = await PATCH(patchReq({ stage: "primary" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(stageDbMocks.setHalaqahStage).toHaveBeenCalledWith(7, "primary");
    expect(auditMocks.logSecurityEvent).toHaveBeenCalledWith({
      event: "halaqah.stage_change",
      actorKind: "teacher",
      actorId: 2,
      details: { halaqahId: 7, from: "intermediate", to: "primary" },
    });
  });

  it("stage=null يعيد النمط الافتراضي ويسجَّل كذلك", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    stageDbMocks.getHalaqahStage.mockResolvedValue("primary");

    const res = await PATCH(patchReq({ stage: null }));

    expect(res.status).toBe(200);
    expect(stageDbMocks.setHalaqahStage).toHaveBeenCalledWith(7, null);
    expect(auditMocks.logSecurityEvent).toHaveBeenCalledWith({
      event: "halaqah.stage_change",
      actorKind: "teacher",
      actorId: 2,
      details: { halaqahId: 7, from: "primary", to: null },
    });
  });

  it("الفئة والخيار معاً بضغطة واحدة: يغيّر الاثنين", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);

    const res = await PATCH(patchReq({ stage: "primary", buddyResetOnEdit: true }));

    expect(res.status).toBe(200);
    expect(stageDbMocks.setHalaqahStage).toHaveBeenCalledWith(7, "primary");
    expect(dbMocks.setHalaqahBuddyResetOnEdit).toHaveBeenCalledWith(7, true);
  });

  it("فئة غير معروفة: 400 بلا تغيير ولا حدث تدقيق", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);

    const res = await PATCH(patchReq({ stage: "kg" }));

    expect(res.status).toBe(400);
    expect(stageDbMocks.setHalaqahStage).not.toHaveBeenCalled();
    expect(dbMocks.setHalaqahBuddyResetOnEdit).not.toHaveBeenCalled();
    expect(auditMocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it("المساعد يرى الفئة ولا يغيّرها: 403 بلا تحديث", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);

    const res = await PATCH(patchReq({ stage: "primary" }));

    expect(res.status).toBe(403);
    expect(stageDbMocks.setHalaqahStage).not.toHaveBeenCalled();
    expect(auditMocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it("جسم فارغ بلا أي حقل: 400", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);

    const res = await PATCH(patchReq({}));

    expect(res.status).toBe(400);
    expect(stageDbMocks.setHalaqahStage).not.toHaveBeenCalled();
    expect(dbMocks.setHalaqahBuddyResetOnEdit).not.toHaveBeenCalled();
  });

  it("تجاوز حدّ المعدّل: 429 بلا تغيير", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    rateMocks.checkRateLimit.mockResolvedValueOnce(false);

    const res = await PATCH(patchReq({ stage: "primary" }));

    expect(res.status).toBe(429);
    expect(stageDbMocks.setHalaqahStage).not.toHaveBeenCalled();
  });
});
