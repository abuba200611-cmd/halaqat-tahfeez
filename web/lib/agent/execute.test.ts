import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  تنفيذ المقترحات بعد موافقة الإنسان: إعادة تحقق كاملة بنفس قواعد
  المسارات — الميزة ما زالت مفعّلة، والمعرّفات من نفس الجامع، والحمولة
  صالحة. أي إخفاق = failed برسالة ولا يُلمس أي صف.
*/

const mocks = vi.hoisted(() => ({
  isFeatureEnabled: vi.fn(),
  setMosqueFeature: vi.fn(),
  createFamily: vi.fn(),
  createCommitteeTask: vi.fn(),
  getBadge: vi.fn(),
  findBadgeTargetName: vi.fn(),
  awardBadge: vi.fn(),
  createScheduleSlot: vi.fn(),
  checkScheduleRef: vi.fn(),
  logDevAction: vi.fn(),
}));

vi.mock("@/lib/mosque/db", () => ({ ...mocks }));
vi.mock("@/lib/dev-audit", () => ({ logDevAction: mocks.logDevAction }));

const { executeAgentProposal } = await import("./execute");

beforeEach(() => {
  mocks.isFeatureEnabled.mockResolvedValue(true);
  mocks.logDevAction.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("حرّاس التنفيذ", () => {
  it("الميزة المعطّلة بعد إنشاء المقترح: فشل بلا لمس أي دالة", async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false);
    const result = await executeAgentProposal(1, "create_family", { name: "أسرة" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("معطّلة");
    expect(mocks.createFamily).not.toHaveBeenCalled();
  });

  it("نوع مقترح مجهول: فشل", async () => {
    const result = await executeAgentProposal(1, "drop_tables", {});
    expect(result.ok).toBe(false);
  });
});

describe("toggle_feature", () => {
  it("مفتاح صالح: نفس دالة المسار مع جامع الجلسة وسجل تدقيق", async () => {
    const result = await executeAgentProposal(1, "toggle_feature", { key: "badges", enabled: true });

    expect(mocks.setMosqueFeature).toHaveBeenCalledWith(1, "badges", true);
    expect(mocks.logDevAction).toHaveBeenCalledWith("feature_toggle", "mosque", 1, expect.objectContaining({ via: "agent" }));
    expect(result.ok).toBe(true);
  });

  it("مفتاح غير معروف أو «قريباً»: فشل", async () => {
    const result = await executeAgentProposal(1, "toggle_feature", { key: "unknown_x", enabled: true });
    expect(result.ok).toBe(false);
    expect(mocks.setMosqueFeature).not.toHaveBeenCalled();
  });
});

describe("create_family / create_committee_task", () => {
  it("أسرة صالحة: تنشأ بجامع الجلسة", async () => {
    mocks.createFamily.mockResolvedValue({ id: 9, name: "أسرة النور" });
    const result = await executeAgentProposal(3, "create_family", { name: "أسرة النور", leaderName: "أبو يوسف" });
    expect(mocks.createFamily).toHaveBeenCalledWith(3, expect.objectContaining({ name: "أسرة النور", leaderName: "أبو يوسف" }));
    expect(result.ok).toBe(true);
  });

  it("حمولة قديمة فاسدة (اسم فارغ): فشل رغم وجود المقترح", async () => {
    const result = await executeAgentProposal(3, "create_family", { name: "   " });
    expect(result.ok).toBe(false);
    expect(mocks.createFamily).not.toHaveBeenCalled();
  });

  it("لجنة ليست من هذا الجامع: فشل برسالة عدم الوجود", async () => {
    mocks.createCommitteeTask.mockResolvedValue(null);
    const result = await executeAgentProposal(3, "create_committee_task", { committeeId: 88, title: "مهمة" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("اللجنة غير موجودة");
  });
});

describe("award_badge — الوسام والهدف من نفس الجامع", () => {
  it("وسام وهدف صالحان: المنح يتم ويعود اسم الهدف", async () => {
    mocks.getBadge.mockResolvedValue({ id: 2, name: "المتميز" });
    mocks.findBadgeTargetName.mockResolvedValue("سعد");
    mocks.awardBadge.mockResolvedValue({ id: 30, targetName: "سعد" });

    const result = await executeAgentProposal(5, "award_badge", { badgeId: 2, targetKind: "student", targetId: 8, note: "" });

    expect(mocks.findBadgeTargetName).toHaveBeenCalledWith(5, "student", 8);
    expect(mocks.awardBadge).toHaveBeenCalledWith(5, 2, "student", 8, expect.any(String), "");
    expect(result.ok).toBe(true);
  });

  it("هدف من جامع آخر: يُرفض قبل أي منح", async () => {
    mocks.getBadge.mockResolvedValue({ id: 2, name: "المتميز" });
    mocks.findBadgeTargetName.mockResolvedValue(null);

    const result = await executeAgentProposal(5, "award_badge", { badgeId: 2, targetKind: "student", targetId: 999 });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("ليس من هذا الجامع");
    expect(mocks.awardBadge).not.toHaveBeenCalled();
  });

  it("تكرار منح نفس اليوم: فشل برسالة التكرار", async () => {
    mocks.getBadge.mockResolvedValue({ id: 2, name: "المتميز" });
    mocks.findBadgeTargetName.mockResolvedValue("سعد");
    mocks.awardBadge.mockResolvedValue("duplicate");

    const result = await executeAgentProposal(5, "award_badge", { badgeId: 2, targetKind: "student", targetId: 8 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("اليوم");
  });
});

describe("add_schedule_slot", () => {
  it("خانة صالحة: تُفحص روابطها ثم تُنشأ", async () => {
    mocks.checkScheduleRef.mockResolvedValue(null);
    mocks.createScheduleSlot.mockResolvedValue({ id: 7, title: "ورد الفجر" });

    const result = await executeAgentProposal(6, "add_schedule_slot", {
      dayOfWeek: 0,
      period: "fajr",
      title: "ورد الفجر",
      programKind: "other",
      refId: null,
      startTime: null,
      location: null,
      notes: null,
    });

    expect(mocks.checkScheduleRef).toHaveBeenCalledWith(6, expect.objectContaining({ title: "ورد الفجر" }));
    expect(mocks.createScheduleSlot).toHaveBeenCalledWith(6, expect.objectContaining({ dayOfWeek: 0 }));
    expect(result.ok).toBe(true);
  });

  it("ربط بكيان من جامع آخر (رسالة checkScheduleRef): فشل ولا تُنشأ خانة", async () => {
    mocks.checkScheduleRef.mockResolvedValue("المرتبط ليس من هذا الجامع");

    const result = await executeAgentProposal(6, "add_schedule_slot", {
      dayOfWeek: 1,
      period: "asr",
      title: "برنامج",
      programKind: "halaqah",
      refId: 44,
      startTime: null,
      location: null,
      notes: null,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("ليس من هذا الجامع");
    expect(mocks.createScheduleSlot).not.toHaveBeenCalled();
  });
});
