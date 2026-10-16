import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  حلقة تشغيل الإيجنت — بمزوّد مزيَّف يتبع سيناريو محدداً: أدوات تُوزَّع
  بجامع الجلسة، نتائج الأدوات تعود داخل محددات <بيانات> (تحصين حقن)،
  المقترحات تعود للعميل، التوكنات تُجمع عبر الجولات، وفشل المزوّد
  يتحول لخطأ عريب لا استثناء.
*/

const mocks = vi.hoisted(() => ({
  buildAgentSystemPrompt: vi.fn(),
  dispatchAgentTool: vi.fn(),
}));

vi.mock("./context", () => ({ buildAgentSystemPrompt: mocks.buildAgentSystemPrompt }));
vi.mock("./tools", () => ({
  AGENT_TOOL_SCHEMAS: [{ name: "get_report", description: "", input_schema: { type: "object" as const, properties: {} } }],
  dispatchAgentTool: mocks.dispatchAgentTool,
}));

const { runAgent, AgentRouteError, sanitizeHistory } = await import("./run");

function fakeProvider(script: { text: string; toolCalls?: { id: string; name: string; arguments: Record<string, unknown> }[] }[]) {
  const calls: unknown[] = [];
  return {
    calls,
    async chat(input: { system: string; messages: unknown[]; tools: unknown[]; maxTokens: number }) {
      calls.push(input);
      const step = script[Math.min(calls.length - 1, script.length - 1)];
      return {
        text: step.text,
        toolCalls: step.toolCalls ?? [],
        usage: { inputTokens: 100, outputTokens: 20 },
      };
    },
  };
}

beforeEach(() => {
  mocks.buildAgentSystemPrompt.mockResolvedValue("النظام");
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("sanitizeHistory", () => {
  it("يقصّ الجسم ويقبل الرسائل النصية فقط", () => {
    const history = sanitizeHistory([
      { role: "user", content: "  سؤال  " },
      { role: "assistant", content: 5 },
      { role: "system", content: "تسلل" },
      { role: "assistant", content: "جواب" },
    ]);
    expect(history).toEqual([
      { role: "user", content: "سؤال" },
      { role: "assistant", content: "جواب" },
    ]);
  });

  it("يقصّ المحادثة لآخر ٢٠ رسالة ويحدّ طول كل رسالة", () => {
    const long = Array.from({ length: 25 }, (_, i) => ({ role: "user" as const, content: `رسالة ${i}` }));
    expect(sanitizeHistory(long)).toHaveLength(20);
    const capped = sanitizeHistory([{ role: "user", content: "أ".repeat(9000) }]);
    expect(capped[0].content.length).toBe(4000);
  });
});

describe("runAgent", () => {
  it("رد مباشر بلا أدوات: جولة واحدة والرد كما هو", async () => {
    const provider = fakeProvider([{ text: "مرحباً بك" }]);
    const result = await runAgent({ provider, mosqueId: 1, userId: 2, history: [{ role: "user", content: "سلام" }] });

    expect(result.reply).toBe("مرحباً بك");
    expect(result.proposals).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20 });
    expect(provider.calls).toHaveLength(1);
  });

  it("جولة أدوات: توزيع بجامع الجلسة، نتيجة داخل <بيانات>، مقترح يعود للعميل، توكنات مجمّعة", async () => {
    const proposal = { id: 3, mosqueId: 1, userId: 2, kind: "toggle_feature", payload: {}, status: "pending" as const, createdAt: "", decidedAt: null };
    const provider = fakeProvider([
      { text: "لحظة", toolCalls: [{ id: "t1", name: "toggle_feature", arguments: { key: "badges", enabled: true, mosqueId: 66 } }] },
      { text: "أنشأت مقترحاً بانتظار موافقتك" },
    ]);
    mocks.dispatchAgentTool.mockResolvedValue({ content: "أُنشئ مقترح #3", proposal });

    const result = await runAgent({ provider, mosqueId: 1, userId: 2, history: [{ role: "user", content: "فعّل الأوسمة" }] });

    expect(mocks.dispatchAgentTool).toHaveBeenCalledWith(
      1,
      2,
      expect.objectContaining({ name: "toggle_feature", arguments: expect.objectContaining({ mosqueId: 66 }) }),
    );
    expect(result.proposals).toEqual([proposal]);
    expect(result.reply).toBe("أنشأت مقترحاً بانتظار موافقتك");
    expect(result.usage).toEqual({ inputTokens: 200, outputTokens: 40 });

    const secondCall = provider.calls[1] as { messages: { role: string; content: unknown }[] };
    const toolResultMessage = secondCall.messages.at(-1) as { role: string; content: { toolUseId: string; content: string }[] };
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content[0].toolUseId).toBe("t1");
    expect(toolResultMessage.content[0].content).toContain("<بيانات>");
  });

  it("النظام المبني يُمرَّر للمزوّد مع سقف 1024 توكن", async () => {
    const provider = fakeProvider([{ text: "تم" }]);
    await runAgent({ provider, mosqueId: 4, userId: null, history: [{ role: "user", content: "سؤال" }] });

    expect(mocks.buildAgentSystemPrompt).toHaveBeenCalledWith(4);
    const call = provider.calls[0] as { system: string; maxTokens: number };
    expect(call.system).toBe("النظام");
    expect(call.maxTokens).toBe(1024);
  });

  it("محادثة بلا رسالة مستخدم أخيرة: خطأ توجيه", async () => {
    const provider = fakeProvider([{ text: "" }]);
    await expect(
      runAgent({ provider, mosqueId: 1, userId: null, history: [{ role: "assistant", content: "جواب" }] }),
    ).rejects.toBeInstanceOf(AgentRouteError);
  });

  it("فشل المزوّد: AgentRouteError برسالة عربية — لا استثناء خام", async () => {
    const provider = { chat: vi.fn().mockRejectedValue(new Error("503 from provider")) };
    await expect(
      runAgent({ provider: provider as never, mosqueId: 1, userId: null, history: [{ role: "user", content: "س" }] }),
    ).rejects.toThrow("تعذّر الوصول للمساعد الآن");
  });

  it("دوران بلا نهاية: سقف الجولات ثم جملة ختام بلا أدوات", async () => {
    const provider = fakeProvider([
      { text: "أداة", toolCalls: [{ id: "t", name: "get_report", arguments: {} }] },
      { text: "أداة", toolCalls: [{ id: "t", name: "get_report", arguments: {} }] },
      { text: "أداة", toolCalls: [{ id: "t", name: "get_report", arguments: {} }] },
      { text: "أداة", toolCalls: [{ id: "t", name: "get_report", arguments: {} }] },
      { text: "أداة", toolCalls: [{ id: "t", name: "get_report", arguments: {} }] },
      { text: "أكثر من ذلك يحتاج قرارك" },
    ]);
    mocks.dispatchAgentTool.mockResolvedValue({ content: "نتيجة" });

    const result = await runAgent({ provider, mosqueId: 1, userId: null, history: [{ role: "user", content: "س" }] });

    expect(result.reply).toBe("أكثر من ذلك يحتاج قرارك");
    // ٥ جولات أدوات + جملة ختام واحدة
    expect(provider.calls).toHaveLength(6);
  });
});
