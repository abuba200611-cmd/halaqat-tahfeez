import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  بوابة محادثة المساعد: 401 بلا جلسة، 404 لميزة معطّلة، 503 بلا مفتاح
  مزوّد («المساعد غير مفعّل بعد» — لا انهيار)، 429 عند تجاوز حدّي اليوم
  (٦٠ للجامع و٣٠ للمستخدم)، والنجاح يسجّل التوكنات ويصل الرد والمقترحات.
*/

const mocks = vi.hoisted(() => ({
  canAccessMosque: vi.fn(),
  isFeatureEnabled: vi.fn(),
  getMosque: vi.fn(),
  currentMosqueAdmin: vi.fn(),
  getAgentProvider: vi.fn(),
  checkRateLimit: vi.fn(),
  runAgent: vi.fn(),
  logAgentUsage: vi.fn(),
  proposalDto: vi.fn(),
}));

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: mocks.canAccessMosque }));
vi.mock("@/lib/mosque/admin-auth", () => ({
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
}));
vi.mock("@/lib/mosque/db", () => ({ isFeatureEnabled: mocks.isFeatureEnabled, getMosque: mocks.getMosque }));
vi.mock("@/lib/mosque-auth", () => ({ currentMosqueAdmin: mocks.currentMosqueAdmin }));
vi.mock("@/lib/agent/provider", () => ({ getAgentProvider: mocks.getAgentProvider }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimited: () => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 }),
}));
vi.mock("@/lib/agent/run", () => ({
  runAgent: mocks.runAgent,
  AgentRouteError: class AgentRouteError extends Error {},
  sanitizeHistory: (messages: unknown) =>
    (Array.isArray(messages) ? messages : [])
      .filter(
        (raw): raw is { role: "user" | "assistant"; content: string } =>
          typeof raw === "object" &&
          raw !== null &&
          ((raw as { role: unknown }).role === "user" || (raw as { role: unknown }).role === "assistant") &&
          typeof (raw as { content: unknown }).content === "string" &&
          (raw as { content: string }).content.trim() !== "",
      )
      .map((message) => ({ role: message.role, content: message.content.trim().slice(0, 4000) })),
}));
vi.mock("@/lib/agent/store", () => ({ logAgentUsage: mocks.logAgentUsage }));
vi.mock("@/lib/agent/dto", () => ({ proposalDto: mocks.proposalDto }));

const { POST } = await import("@/app/api/mosques/[id]/agent/chat/route");

const CONTEXT = { params: Promise.resolve({ id: "7" }) };

function request(body: unknown) {
  return new Request("http://localhost/api/mosques/7/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canAccessMosque.mockResolvedValue(true);
  mocks.isFeatureEnabled.mockResolvedValue(true);
  mocks.getMosque.mockResolvedValue({ id: 7, name: "الجامع", city: "", createdAt: "" });
  mocks.currentMosqueAdmin.mockResolvedValue({ id: 3, mosqueId: 7, username: "admin" });
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.getAgentProvider.mockReturnValue(null);
  mocks.runAgent.mockResolvedValue({ reply: "تم", proposals: [], usage: { inputTokens: 0, outputTokens: 0 } });
  mocks.proposalDto.mockImplementation((proposal: { id: number }) => ({ id: proposal.id, status: "pending", title: "t", summary: "s", kind: "k", createdAt: "", decidedAt: null }));
});

describe("بوابات المسار", () => {
  it("بلا صلاحية على الجامع: 401 ولا يُلمس المزوّد", async () => {
    mocks.canAccessMosque.mockResolvedValue(false);
    const res = await POST(request({ messages: [{ role: "user", content: "س" }] }), CONTEXT);
    expect(res.status).toBe(401);
    expect(mocks.getAgentProvider).not.toHaveBeenCalled();
  });

  it("ميزة المساعد معطّلة: 404", async () => {
    mocks.isFeatureEnabled.mockResolvedValue(false);
    const res = await POST(request({ messages: [{ role: "user", content: "س" }] }), CONTEXT);
    expect(res.status).toBe(404);
  });

  it("بلا مفتاح مزوّد: 503 برسالة «المساعد غير مفعّل بعد» — لا انهيار", async () => {
    mocks.getAgentProvider.mockReturnValue(null);
    const res = await POST(request({ messages: [{ role: "user", content: "س" }] }), CONTEXT);
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("المساعد غير مفعّل بعد");
    expect(mocks.runAgent).not.toHaveBeenCalled();
  });
});

describe("حدود المعدّل اليومية", () => {
  it("٦٠ رسالة للجامع و٣٠ للمستخدم بمفاتيح مميزة — تجاوز أيٍّ منها 429", async () => {
    mocks.getAgentProvider.mockReturnValue({ chat: vi.fn() });

    await POST(request({ messages: [{ role: "user", content: "س" }] }), CONTEXT);

    expect(mocks.checkRateLimit).toHaveBeenCalledWith("agent:mosque:7", 60, 86_400);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("agent:user:admin:3", 30, 86_400);

    mocks.runAgent.mockClear();
    mocks.checkRateLimit.mockResolvedValueOnce(false); // حدّ الجامع
    const limited = await POST(request({ messages: [{ role: "user", content: "س" }] }), CONTEXT);
    expect(limited.status).toBe(429);
    expect(mocks.runAgent).not.toHaveBeenCalled();

    mocks.checkRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false); // حدّ المستخدم
    const userLimited = await POST(request({ messages: [{ role: "user", content: "س" }] }), CONTEXT);
    expect(userLimited.status).toBe(429);
  });

  it("المشرف العام (بلا حساب مدير): مفتاح مستخدم super", async () => {
    mocks.getAgentProvider.mockReturnValue({ chat: vi.fn() });
    mocks.currentMosqueAdmin.mockResolvedValue(null);
    mocks.runAgent.mockResolvedValue({ reply: "", proposals: [], usage: { inputTokens: 0, outputTokens: 0 } });

    await POST(request({ messages: [{ role: "user", content: "س" }] }), CONTEXT);

    expect(mocks.checkRateLimit).toHaveBeenCalledWith("agent:user:super", 30, 86_400);
    expect(mocks.runAgent).toHaveBeenCalledWith(expect.objectContaining({ mosqueId: 7, userId: null }));
  });
});

describe("التشغيل والتسجيل", () => {
  it("رسائل فارغة أو آخرها ليس من المستخدم: 400", async () => {
    mocks.getAgentProvider.mockReturnValue({ chat: vi.fn() });
    const res = await POST(request({ messages: [] }), CONTEXT);
    expect(res.status).toBe(400);
  });

  it("النجاح: الرد والمقترحات يصلان، والتوكنات تُسجَّل للجامع", async () => {
    mocks.getAgentProvider.mockReturnValue({ chat: vi.fn() });
    mocks.runAgent.mockResolvedValue({
      reply: "تفضل",
      proposals: [{ id: 9, kind: "k", payload: {}, status: "pending", mosqueId: 7, userId: 3, createdAt: "", decidedAt: null }],
      usage: { inputTokens: 1500, outputTokens: 90 },
    });

    const res = await POST(request({ messages: [{ role: "user", content: "كم طالباً عندنا؟" }] }), CONTEXT);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { reply: string; proposals: { id: number }[] };
    expect(body.reply).toBe("تفضل");
    expect(body.proposals).toEqual([{ id: 9, status: "pending", title: "t", summary: "s", kind: "k", createdAt: "", decidedAt: null }]);
    expect(mocks.logAgentUsage).toHaveBeenCalledWith(7, 1500, 90);
  });

  it("فشل تسجيل التوكنات لا يُفشل الرد", async () => {
    mocks.getAgentProvider.mockReturnValue({ chat: vi.fn() });
    mocks.runAgent.mockResolvedValue({ reply: "تم", proposals: [], usage: { inputTokens: 10, outputTokens: 5 } });
    mocks.logAgentUsage.mockRejectedValue(new Error("db down"));

    const res = await POST(request({ messages: [{ role: "user", content: "س" }] }), CONTEXT);
    expect(res.status).toBe(200);
  });
});
