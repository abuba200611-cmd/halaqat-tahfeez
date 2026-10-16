import "server-only";

import {
  AGENT_MAX_OUTPUT_TOKENS,
  type AgentChatMessage,
  type AgentMessage,
  type AgentProvider,
  type AgentToolResult,
  type AgentUsage,
} from "./provider";
import { buildAgentSystemPrompt } from "./context";
import { AGENT_TOOL_SCHEMAS, dispatchAgentTool } from "./tools";
import type { AgentProposal } from "./store";

/*
  حلقة إيجنت MOS لرسالة واحدة: كتلة نظام مؤقَّتة بالكشف + محادثة العميل
  + حتى MAX_TOOL_ROUNDS جولة أدوات. أدوات القراءة والذاكرة تنفَّذ فوراً،
  وأدوات الكتابة تنشئ مقترحات فقط. فشل المزوّد يرمي RouteError برسالة
  عربية بدل انهيار المحادثة.
*/

/** جولات أدوات كافية لقراءة ثم اقتراح ثم تلخيص — وسقف يمنع الدوران */
const MAX_TOOL_ROUNDS = 5;

/** طول المحادثة المرسل من العميل — ما قبلها يُهمل كي لا ينفد السياق */
const MAX_HISTORY_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;

export class AgentRouteError extends Error {}

/** ما يرجأ به العميل من طلب محادثة واحد */
export type AgentRunResult = {
  reply: string;
  proposals: AgentProposal[];
  usage: AgentUsage;
};

/** يقصّ المحادثة القادمة من العميل ويشترط أن آخرها من المستخدم */
export function sanitizeHistory(messages: unknown): AgentChatMessage[] {
  if (!Array.isArray(messages)) return [];
  const cleaned: AgentChatMessage[] = [];
  for (const raw of messages.slice(-MAX_HISTORY_MESSAGES)) {
    const message = raw as { role?: unknown; content?: unknown };
    if ((message.role !== "user" && message.role !== "assistant") || typeof message.content !== "string") continue;
    const content = message.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (content) cleaned.push({ role: message.role, content });
  }
  return cleaned;
}

export async function runAgent(opts: {
  provider: AgentProvider;
  mosqueId: number;
  userId: number | null;
  history: AgentChatMessage[];
}): Promise<AgentRunResult> {
  const { provider, mosqueId, userId, history } = opts;
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    throw new AgentRouteError("اكتب رسالة للمساعد أولاً");
  }

  const system = await buildAgentSystemPrompt(mosqueId);
  const messages: AgentMessage[] = history.map((message): AgentMessage =>
    message.role === "user" ? { role: "user", content: message.content } : { role: "assistant", content: message.content },
  );

  const usage: AgentUsage = { inputTokens: 0, outputTokens: 0 };
  const proposals: AgentProposal[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let result;
    try {
      result = await provider.chat({
        system,
        messages,
        tools: [...AGENT_TOOL_SCHEMAS],
        maxTokens: AGENT_MAX_OUTPUT_TOKENS,
      });
    } catch (error) {
      console.error("agent provider call failed", error);
      throw new AgentRouteError("تعذّر الوصول للمساعد الآن — حاول بعد قليل");
    }

    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;

    if (result.toolCalls.length === 0) {
      return { reply: result.text.trim() || "لم أفهم الطلب — أعد صياغته من فضلك", proposals, usage };
    }

    messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });

    const results: AgentToolResult[] = [];
    for (const call of result.toolCalls) {
      const dispatch = await dispatchAgentTool(mosqueId, userId, call);
      if (dispatch.proposal) proposals.push(dispatch.proposal);
      // نتائج الأدوات بيانات داخل محددات — لا تعليمات، حتى من أدوات القراءة
      results.push({ toolUseId: call.id, content: `<بيانات>\n${dispatch.content}\n</بيانات>` });
    }
    messages.push({ role: "user", content: results });
  }

  // خرجنا من السقف بلا جملة ختام — نطلب تلخيصاً واحداً بلا أدوات
  try {
    const closing = await provider.chat({ system, messages, tools: [], maxTokens: AGENT_MAX_OUTPUT_TOKENS });
    usage.inputTokens += closing.usage.inputTokens;
    usage.outputTokens += closing.usage.outputTokens;
    return { reply: closing.text.trim() || "أنجزت ما استطعت — راجع المقترحات أعلاه", proposals, usage };
  } catch (error) {
    console.error("agent closing call failed", error);
    return { reply: "أنجزت ما استطعت — راجع المقترحات أعلاه", proposals, usage };
  }
}
