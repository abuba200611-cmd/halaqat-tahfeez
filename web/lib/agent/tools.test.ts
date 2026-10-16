import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  توزيع أدوات الإيجنت: الجامع من الجلسة حصراً — أي mosqueId يرسله النموذج
  ضمن arguments يُتجاهل؛ أدوات الكتابة تنشئ مقترحاً ولا تلمس دوال النطاق؛
  الدروس تُنظَّف قبل الحفظ وتُرفض إن بقيت فيها هوية.
*/

const mocks = vi.hoisted(() => ({
  listMosqueRegistrations: vi.fn(),
  listMosqueMembers: vi.fn(),
  listHalaqahs: vi.fn(),
  getMosqueFeatures: vi.fn(),
  createAgentProposal: vi.fn(),
  saveAgentMemory: vi.fn(),
  createAgentLesson: vi.fn(),
  listMosquePersonNames: vi.fn(),
  getHalaqahStats: vi.fn(),
  getMetricsForHalaqah: vi.fn(),
  buildMosqueGraph: vi.fn(),
}));

vi.mock("@/lib/mosque/db", () => ({
  listMosqueRegistrations: mocks.listMosqueRegistrations,
  listMosqueMembers: mocks.listMosqueMembers,
  listHalaqahs: mocks.listHalaqahs,
  getMosqueFeatures: mocks.getMosqueFeatures,
}));
vi.mock("./store", () => ({
  AGENT_MEMORY_MAX_CHARS: 500,
  createAgentProposal: mocks.createAgentProposal,
  saveAgentMemory: mocks.saveAgentMemory,
  createAgentLesson: mocks.createAgentLesson,
  listMosquePersonNames: mocks.listMosquePersonNames,
}));
vi.mock("@/lib/mosque/halaqat", () => ({
  getHalaqahStats: mocks.getHalaqahStats,
  getMetricsForHalaqah: mocks.getMetricsForHalaqah,
}));
vi.mock("@/lib/mosque/brain-graph", () => ({
  buildMosqueGraph: mocks.buildMosqueGraph,
  buildGraphContext: vi.fn(() => "سياق الجامع"),
}));

const { dispatchAgentTool, describeProposal } = await import("./tools");

const fakeProposal = { id: 11, mosqueId: 1, userId: 5, kind: "", payload: {}, status: "pending" as const, createdAt: "", decidedAt: null };

beforeEach(() => {
  mocks.listMosqueRegistrations.mockResolvedValue([]);
  mocks.listMosqueMembers.mockResolvedValue([]);
  mocks.listHalaqahs.mockResolvedValue([]);
  mocks.getMosqueFeatures.mockResolvedValue([]);
  mocks.listMosquePersonNames.mockResolvedValue([]);
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("عزل الجامع — mosqueId من الجلسة لا من النموذج", () => {
  it("find_student مع mosqueId مزوَّر 999: الاستعلام بجامع الجلسة 1", async () => {
    mocks.listMosqueRegistrations.mockResolvedValue([
      { id: 3, mosqueId: 1, name: "محمد سعد", phone: "0500", status: "pending", halaqahId: null, studentId: null, createdAt: "", assignedAt: null },
    ]);

    const result = await dispatchAgentTool(1, 5, { id: "t1", name: "find_student", arguments: { name: "محمد", mosqueId: 999 } });

    expect(mocks.listMosqueRegistrations).toHaveBeenCalledWith(1);
    expect(result.content).toContain("محمد سعد");
  });

  it("get_mosque_overview مع mosqueId مزوَّر: الرسم يُبنى لجامع الجلسة", async () => {
    mocks.buildMosqueGraph.mockResolvedValue({ nodes: [], edges: [] });

    await dispatchAgentTool(1, 5, { id: "t2", name: "get_mosque_overview", arguments: { mosqueId: 42 } });

    expect(mocks.buildMosqueGraph).toHaveBeenCalledWith(1);
  });

  it("أداة الكتابة تنشئ المقترح بجامع الجلسة — لا تنفّذ شيئاً", async () => {
    mocks.createAgentProposal.mockResolvedValue({ ...fakeProposal, id: 12, kind: "create_family", payload: { name: "أسرة الفجر" } });

    const result = await dispatchAgentTool(1, 5, {
      id: "t3",
      name: "create_family",
      arguments: { name: "أسرة الفجر", mosqueId: 77 },
    });

    expect(mocks.createAgentProposal).toHaveBeenCalledWith(1, 5, "create_family", expect.objectContaining({ name: "أسرة الفجر" }));
    expect(result.proposal).toBeDefined();
    expect(result.content).toContain("موافقة");
  });
});

describe("تحقق أدوات الكتابة قبل إنشاء المقترح", () => {
  it("مفتاح ميزة غير معروف: رسالة خطأ ولا مقترح", async () => {
    const result = await dispatchAgentTool(1, 5, { id: "t4", name: "toggle_feature", arguments: { key: "nope", enabled: true } });
    expect(result.proposal).toBeUndefined();
    expect(result.content).toContain("غير معروف");
  });

  it("خانة جدول فاسدة (يوم خارج 0-6): تُرفض بلا مقترح", async () => {
    const result = await dispatchAgentTool(1, 5, {
      id: "t5",
      name: "add_schedule_slot",
      arguments: { dayOfWeek: 9, period: "fajr", title: "برنامج" },
    });
    expect(result.proposal).toBeUndefined();
    expect(result.content).toContain("اليوم");
  });

  it("حمولة صالحة تُمرَّر منقّحة كما في مسارات المزايا", async () => {
    mocks.createAgentProposal.mockResolvedValue({ ...fakeProposal, kind: "award_badge", payload: {} });
    await dispatchAgentTool(1, 5, {
      id: "t6",
      name: "award_badge",
      arguments: { badgeId: 2, targetKind: "student", targetId: 8, note: "أداء مميز" },
    });
    expect(mocks.createAgentProposal).toHaveBeenCalledWith(1, 5, "award_badge", {
      badgeId: 2,
      targetKind: "student",
      targetId: 8,
      awardedAt: null,
      note: "أداء مميز",
    });
  });
});

describe("أدوات الذاكرة والدروس", () => {
  it("save_memory ينفَّذ فوراً بلا موافقة وبنطاق الجامع", async () => {
    mocks.saveAgentMemory.mockResolvedValue({ id: 1, mosqueId: 1, content: "تفضيل", source: "agent", createdAt: "" });
    const result = await dispatchAgentTool(1, 5, { id: "t7", name: "save_memory", arguments: { content: "تفضيل" } });
    expect(mocks.saveAgentMemory).toHaveBeenCalledWith(1, "تفضيل", "agent");
    expect(result.content).toContain("حُفظت");
  });

  it("suggest_lesson بهاتف: يُحذف الهاتف ويُحفظ الدرس منظّفاً", async () => {
    mocks.createAgentLesson.mockResolvedValue({ id: 8, content: "", fromMosqueId: 1, status: "pending", createdAt: "", decidedAt: null });
    const result = await dispatchAgentTool(1, 5, {
      id: "t8",
      name: "suggest_lesson",
      arguments: { content: "الطالب 0501234567 يفضّل التسميع بعد العصر دائماً" },
    });
    expect(mocks.createAgentLesson).toHaveBeenCalledWith(1, expect.not.stringContaining("0501234567"));
    expect(result.content).toContain("للموافقة");
  });

  it("suggest_lesson نظيف: يُحفظ كما هو تقريباً", async () => {
    mocks.createAgentLesson.mockResolvedValue({ id: 9, content: "درس", fromMosqueId: 1, status: "pending", createdAt: "", decidedAt: null });
    const result = await dispatchAgentTool(1, 5, {
      id: "t9",
      name: "suggest_lesson",
      arguments: { content: "المراجعة القصيرة قبل التسميع الجديد ترفع التفاعل" },
    });
    expect(mocks.createAgentLesson).toHaveBeenCalledWith(1, "المراجعة القصيرة قبل التسميع الجديد ترفع التفاعل");
    expect(result.content).toContain("#9");
  });

  it("suggest_lesson باسم مسجّل: يُحذف الاسم قبل الحفظ — لا يتسرب للدليل المشترك", async () => {
    mocks.createAgentLesson.mockResolvedValue({ id: 10, content: "", fromMosqueId: 1, status: "pending", createdAt: "", decidedAt: null });
    mocks.listMosquePersonNames.mockResolvedValue(["عبدالرحمن الشهري"]);
    await dispatchAgentTool(1, 5, {
      id: "t10",
      name: "suggest_lesson",
      arguments: { content: "لاحظت أن عبدالرحمن الشهري يستجيب للتحفيز المباشر" },
    });
    expect(mocks.createAgentLesson).toHaveBeenCalledWith(1, expect.not.stringContaining("عبدالرحمن الشهري"));
  });

  it("suggest_lesson كله هوية (اسم وهاتف فقط): يُرفض ولا يُحفظ درس أعمى", async () => {
    mocks.listMosquePersonNames.mockResolvedValue(["عبدالرحمن الشهري"]);
    const result = await dispatchAgentTool(1, 5, {
      id: "t13",
      name: "suggest_lesson",
      arguments: { content: "عبدالرحمن الشهري 0501234567" },
    });
    expect(mocks.createAgentLesson).not.toHaveBeenCalled();
    expect(result.content).toContain("رُفض");
  });
});

describe("describeProposal — بطاقات عربية للمقترحات", () => {
  it("عناوين واضحة لكل نوع", () => {
    expect(describeProposal("toggle_feature", { key: "badges", enabled: true }).title).toContain("تفعيل");
    expect(describeProposal("create_family", { name: "أسرة النور" }).title).toContain("أسرة النور");
    expect(describeProposal("add_schedule_slot", { dayOfWeek: 0, period: "fajr", title: "ورد الفجر" }).summary).toContain("السبت");
  });
});

describe("أخطاء التنفيذ لا تكسر المحادثة", () => {
  it("أداة قراءة تفشل: نص خطأ ودود لا استثناء", async () => {
    mocks.buildMosqueGraph.mockRejectedValue(new Error("db down"));
    const result = await dispatchAgentTool(1, 5, { id: "t11", name: "get_mosque_overview", arguments: {} });
    expect(result.content).toContain("تعذّر");
  });

  it("أداة غير معروفة: رسالة صريحة", async () => {
    const result = await dispatchAgentTool(1, 5, { id: "t12", name: "delete_everything", arguments: {} });
    expect(result.content).toContain("غير معروفة");
  });
});
