import "server-only";

import Anthropic from "@anthropic-ai/sdk";

/*
  محوّل المزوّد لإيجنت MOS — الواجهة الوحيدة التي يعرفها باقي النظام.
  اليوم: Anthropic Messages API بنموذج claude-haiku-5-5 عبر SDK الرسمي،
  مع تخزين مؤقت للمطالبة (prompt caching) على كتلة النظام كاملة (الدور
  + القواعد + سياق الجامع + الدليل + الذاكرة والدروس) لأنها الأكبر والأثبت
  بين الطلبات. لتبديل المزوّد لاحقاً: تنفيذ AgentProvider آخر فقط.
*/

export const AGENT_MODEL = "claude-haiku-5-5";

/** سقف الرد الواحد — ردود الإيجنت موجزة بالعربية */
export const AGENT_MAX_OUTPUT_TOKENS = 1024;

/** رسالة محادثة نصية عادية (ما يرسله العميل) */
export type AgentChatMessage = { role: "user" | "assistant"; content: string };

/** استدعاء أداة طلبه النموذج — arguments كائن JSON محلولاً */
export type AgentToolCall = { id: string; name: string; arguments: Record<string, unknown> };

/** نتيجة أداة نعيدها للنموذج بدل تنفيذها نحن بجانب المحادثة */
export type AgentToolResult = { toolUseId: string; content: string };

/** رسالة كاملة داخل حلقة الأدوات — نص، أو ردّ مساعد باستدعاءات، أو نتائج أدوات */
export type AgentMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AgentToolCall[] }
  | { role: "user"; content: AgentToolResult[] };

export type AgentToolSchema = {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
};

export type AgentUsage = { inputTokens: number; outputTokens: number };

export type AgentChatResult = {
  text: string;
  toolCalls: AgentToolCall[];
  usage: AgentUsage;
};

export interface AgentProvider {
  chat(input: {
    system: string;
    messages: AgentMessage[];
    tools: AgentToolSchema[];
    maxTokens: number;
  }): Promise<AgentChatResult>;
}

/** التوكنات الداخلة = المقروءة من الكشف + المكتوبة إليه — كلها كلفة حقيقية */
function totalInputTokens(usage: Anthropic.Messages.Usage): number {
  return (
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  );
}

/** يحوّل رسائل الواجهة المحايدة إلى شكل Messages API — هنا فقط يعرف Anthropic */
function toAnthropicMessages(messages: AgentMessage[]): Anthropic.Messages.MessageParam[] {
  return messages.map((message): Anthropic.Messages.MessageParam => {
    if (message.role === "user" && Array.isArray(message.content)) {
      return {
        role: "user",
        content: message.content.map((result) => ({
          type: "tool_result" as const,
          tool_use_id: result.toolUseId,
          content: result.content,
        })),
      };
    }
    if (message.role === "assistant" && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: "assistant",
        content: [
          ...(message.content
            ? [{ type: "text" as const, text: message.content }]
            : []),
          ...message.toolCalls.map((call) => ({
            type: "tool_use" as const,
            id: call.id,
            name: call.name,
            input: call.arguments,
          })),
        ],
      };
    }
    return { role: message.role, content: message.content as string };
  });
}

export function anthropicProvider(apiKey: string): AgentProvider {
  const client = new Anthropic({ apiKey });
  return {
    async chat({ system, messages, tools, maxTokens }) {
      const response = await client.messages.create({
        model: AGENT_MODEL,
        max_tokens: maxTokens,
        // كتلة نظام واحدة موقّعة بالكشف المؤقت — كل السياق الثابت يُقرأ من الكشف
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: toAnthropicMessages(messages),
        tools,
      });

      let text = "";
      const toolCalls: AgentToolCall[] = [];
      for (const block of response.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }

      return {
        text,
        toolCalls,
        usage: {
          inputTokens: totalInputTokens(response.usage),
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}

/** مزوّد الإيجنت الجاهز، أو null إن لم يُضبط ANTHROPIC_API_KEY — لا انهيار أبداً */
export function getAgentProvider(): AgentProvider | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? anthropicProvider(apiKey) : null;
}
