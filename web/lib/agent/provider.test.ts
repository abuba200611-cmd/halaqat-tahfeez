import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  محوّل مزوّد Anthropic — بالـSDK مُحاكى بالكامل: تخزين مطالبة النظام
  بالكشف، تحويل الرسائل ذهاباً وإياباً، جمع التوكنات (مع توكنات الكشف)،
  وغياب المفتاح = مزوّد null (لا انهيار).
*/

const createMock = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => {
  class FakeAnthropic {
    messages = { create: createMock };
    constructor(public options: { apiKey?: string }) {}
  }
  return { default: FakeAnthropic };
});

const { anthropicProvider, getAgentProvider, AGENT_MODEL, AGENT_MAX_OUTPUT_TOKENS } = await import("./provider");

beforeEach(() => {
  createMock.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAgentProvider", () => {
  it("بلا ANTHROPIC_API_KEY: null — لا إنشاء موصّل ولا انهيار", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(getAgentProvider()).toBeNull();
    process.env.ANTHROPIC_API_KEY = previous;
  });

  it("مع المفتاح: مزوّد جاهز", () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(getAgentProvider()).not.toBeNull();
    process.env.ANTHROPIC_API_KEY = previous;
  });
});

describe("anthropicProvider.chat", () => {
  it("كتلة النظام موقّعة بالكشف المؤقت، وبالنموذج وسقف التوكنات المعتمدين", async () => {
    createMock.mockResolvedValue({ content: [], usage: { input_tokens: 1, output_tokens: 2 } });
    const provider = anthropicProvider("sk-test");

    await provider.chat({ system: "النظام", messages: [{ role: "user", content: "مرحبا" }], tools: [], maxTokens: AGENT_MAX_OUTPUT_TOKENS });

    const params = createMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.model).toBe(AGENT_MODEL);
    expect(AGENT_MODEL).toBe("claude-haiku-5-5");
    expect(params.max_tokens).toBe(AGENT_MAX_OUTPUT_TOKENS);
    expect(AGENT_MAX_OUTPUT_TOKENS).toBe(1024);
    expect(params.system).toEqual([{ type: "text", text: "النظام", cache_control: { type: "ephemeral" } }]);
  });

  it("رسالة المساعد باستدعاءات أدوات ورسالة نتائج الأدوات تتحولان لشكل Messages API", async () => {
    createMock.mockResolvedValue({ content: [], usage: {} });
    const provider = anthropicProvider("sk-test");

    await provider.chat({
      system: "s",
      tools: [],
      maxTokens: 10,
      messages: [
        { role: "user", content: "سؤال" },
        { role: "assistant", content: "لحظة", toolCalls: [{ id: "t1", name: "find_student", arguments: { name: "س" } }] },
        { role: "user", content: [{ toolUseId: "t1", content: "<بيانات>…</بيانات>" }] },
      ],
    });

    const params = createMock.mock.calls[0][0] as { messages: unknown[] };
    expect(params.messages).toEqual([
      { role: "user", content: "سؤال" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "لحظة" },
          { type: "tool_use", id: "t1", name: "find_student", input: { name: "س" } },
        ],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "<بيانات>…</بيانات>" }] },
    ]);
  });

  it("الرد يفكك لنص واستدعاءات أدوات، والتوكنات الداخلة تجمع كشف القراءة والكتابة", async () => {
    createMock.mockResolvedValue({
      content: [
        { type: "text", text: "الجواب" },
        { type: "tool_use", id: "t9", name: "get_report", input: { period: "this_week" } },
      ],
      usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 40, output_tokens: 5 },
    });
    const provider = anthropicProvider("sk-test");

    const result = await provider.chat({ system: "s", messages: [{ role: "user", content: "q" }], tools: [], maxTokens: 10 });

    expect(result.text).toBe("الجواب");
    expect(result.toolCalls).toEqual([{ id: "t9", name: "get_report", arguments: { period: "this_week" } }]);
    expect(result.usage).toEqual({ inputTokens: 150, outputTokens: 5 });
  });

  it("استدعاء الأدوات يمر كما هو — الأداة {type:object} بخصائصها", async () => {
    createMock.mockResolvedValue({ content: [], usage: {} });
    const provider = anthropicProvider("sk-test");
    const tool = {
      name: "find_student",
      description: "بحث",
      input_schema: { type: "object" as const, properties: { name: { type: "string" } }, required: ["name"] },
    };

    await provider.chat({ system: "s", messages: [{ role: "user", content: "q" }], tools: [tool], maxTokens: 10 });

    const params = createMock.mock.calls[0][0] as { tools: unknown[] };
    expect(params.tools).toEqual([tool]);
  });
});
