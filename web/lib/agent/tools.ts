import "server-only";

import {
  getHalaqahStats,
  getMetricsForHalaqah,
} from "@/lib/mosque/halaqat";
import { buildGraphContext, buildMosqueGraph } from "@/lib/mosque/brain-graph";
import { getMosqueFeatures, listHalaqahs, listMosqueMembers, listMosqueRegistrations } from "@/lib/mosque/db";
import { currentWeekPeriod, isPeriodChoice, resolvePeriod, type PeriodChoice } from "@/lib/mosque/report-periods";
import { buildHonorBoard } from "@/lib/mosque/honor-board-data";
import { buildMosqueReport } from "@/lib/mosque/report-data";
import { getFeature } from "@/lib/mosque/features";
import { parseSlotBody, dayLabel, periodLabel } from "@/lib/mosque/schedule";
import { parseWeekStart } from "@/lib/mosque/evaluation";
import { text, parseIntIn } from "@/lib/mosque/api-gate";
import type { AgentToolCall, AgentToolSchema } from "./provider";
import {
  AGENT_MEMORY_MAX_CHARS,
  createAgentLesson,
  createAgentProposal,
  listMosquePersonNames,
  saveAgentMemory,
  type AgentProposal,
} from "./store";
import { lessonRejectionReason, sanitizeLesson } from "./sanitizer";

/*
  أدوات إيجنت MOS. قاعدة الأمان الأولى هنا: الجامع لا يأتي أبداً من
  مدخلات النموذج — dispatchAgentTool يستلم mosqueId من جلسة المستدعي
  ويجهض أي حقل mosqueId مرسل ضمن arguments. أدوات القراءة تنفَّذ مباشرة
  (قراءة فقط، بنفس نطاق صلاحيات المدير)، وأدوات الكتابة لا تنفَّذ: تُنشئ
  مقترحاً يُنفَّذ فقط بضغطة الإنسان عبر executeAgentProposal بنفس تحقق
  المسارات. أدوات الذاكرة والدروس تنفَّذ مباشرة (لا تلمس بيانات أخرى).
*/

/** فترات الأدوات — بلا custom كي لا يتلاعب النموذج بالنطاقات */
const TOOL_PERIODS: readonly PeriodChoice[] = ["this_week", "last_week", "hijri_month"];

const periodEnum = {
  type: "string",
  enum: [...TOOL_PERIODS],
  description: "this_week | last_week | hijri_month",
} as const;

function tool(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): AgentToolSchema {
  return { name, description, input_schema: { type: "object", properties, required } };
}

export const AGENT_TOOL_SCHEMAS: readonly AgentToolSchema[] = [
  tool("get_mosque_overview", "نظرة عامة على الجامع: الحلقات وعدد الطلاب والمعلمين وطلبات التسجيل والمزايا المفعّلة والملاحظات.", {}),
  tool("list_halaqahs_with_metrics", "قائمة حلقات الجامع بمقاييس الأسبوع الحالي لكل حلقة (الطلاب النشطون، الإتقان، الحضور، التفاعل، التسميعات).", {}),
  tool("find_student", "البحث عن طالب أو عضو بالاسم (أو جزء منه) ضمن هذا الجامع فقط.", { name: { type: "string", description: "الاسم أو جزؤه" } }, ["name"]),
  tool("get_honor_board", "لوحة الشرف لفترة: ترتيب الحلقات والمتصدّرين من الطلاب.", { period: periodEnum }),
  tool("get_report", "تقرير فترة بمؤشرات كل المزايا: حلقات، تسجيلات، أسر، لجان، تقييم، أوسمة، أنشطة.", { period: periodEnum }),
  tool("list_features", "قائمة مزايا النظام وحالة تفعيل كل منها في هذا الجامع.", {}),

  tool("toggle_feature", "اقتراح تفعيل أو تعطيل ميزة لهذا الجامع (يتطلب موافقة المدير).", {
    key: { type: "string", description: "مفتاح الميزة من list_features" },
    enabled: { type: "boolean" },
    reason: { type: "string", description: "لماذا هذا التغيير (اختياري)" },
  }, ["key", "enabled"]),
  tool("create_family", "اقتراح إنشاء أسرة جديدة في هذا الجامع (يتطلب موافقة المدير).", {
    name: { type: "string" }, leaderName: { type: "string", description: "اسم رئيس الأسرة (اختياري)" }, notes: { type: "string" },
  }, ["name"]),
  tool("create_committee_task", "اقتراح مهمة جديدة للجنة من لجان هذا الجامع (يتطلب موافقة المدير).", {
    committeeId: { type: "number" }, title: { type: "string" }, dueDate: { type: "string", description: "تاريخ الاستحقاق YYYY-MM-DD (اختياري)" },
  }, ["committeeId", "title"]),
  tool("award_badge", "اقتراح منح وسام لطالب أو أسرة أو عضو من هذا الجامع (يتطلب موافقة المدير).", {
    badgeId: { type: "number" }, targetKind: { type: "string", enum: ["student", "family", "member"] }, targetId: { type: "number" },
    awardedAt: { type: "string", description: "تاريخ المنح YYYY-MM-DD (اختياري، الافتراضي اليوم)" }, note: { type: "string" },
  }, ["badgeId", "targetKind", "targetId"]),
  tool("add_schedule_slot", "اقتراح خانة جديدة في الجدول الأسبوعي لهذا الجامع (يتطلب موافقة المدير).", {
    dayOfWeek: { type: "number", description: "0=السبت .. 6=الجمعة" }, period: { type: "string", enum: ["fajr", "dhuhr", "asr", "maghrib", "isha", "other"] },
    startTime: { type: "string", description: "HH:MM (اختياري)" }, title: { type: "string" },
    programKind: { type: "string", enum: ["halaqah", "family", "committee", "lecture", "sport", "cultural", "other"] },
    refId: { type: "number", description: "معرّف الحلقة/الأسرة/اللجنة إن كان البرنامج مرتبطاً بأحدها (اختياري)" },
    location: { type: "string" }, notes: { type: "string" },
  }, ["dayOfWeek", "period", "title"]),

  tool("save_memory", "حفظ تفضيل أو قرار أو سؤال متكرر في ذاكرة هذا الجامع لاسترجاعه بالمحادثات القادمة (لا يحتاج موافقة).", {
    content: { type: "string", description: `الذاكرة بصيغة قصيرة (حتى ${AGENT_MEMORY_MAX_CHARS} محرفاً)` },
  }, ["content"]),
  tool("suggest_lesson", "اقتراح درس عام مجهّل (بلا أسماء ولا هواتف) يفيد كل الجوامع — يُشارك بعد موافقة المطوّر فقط.", {
    content: { type: "string", description: "الدرس بصياغة عامة، بلا أي معلومات تعرّف بالأشخاص" },
  }, ["content"]),
];

/** أنواع أدوات الكتابة — كل ما عداها ينفَّذ مباشرة داخل حدود الجامع */
export const WRITE_TOOL_KINDS: readonly string[] = [
  "toggle_feature",
  "create_family",
  "create_committee_task",
  "award_badge",
  "add_schedule_slot",
];

// ————— مدقّقات مدخلات صغيرة (نفس قواعد مسارات المزايا) —————

function str(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function positiveInt(value: unknown): number | null {
  const parsed = parseIntIn(value, 1, Number.MAX_SAFE_INTEGER);
  return Number.isNaN(parsed) ? null : parsed;
}

function toolPeriod(value: unknown): PeriodChoice {
  return isPeriodChoice(value) && (TOOL_PERIODS as readonly string[]).includes(value) ? value : "this_week";
}

/** شكل أداة كتابة صالح؟ — يرجع الحمولة المنقّحة أو رسالة خطأ للموديل */
function validateWritePayload(call: AgentToolCall): { payload?: Record<string, unknown>; error?: string } {
  const args = call.arguments ?? {};

  switch (call.name) {
    case "toggle_feature": {
      const feature = getFeature(str(args.key, 50));
      if (!feature) return { error: "مفتاح ميزة غير معروف — استخدم list_features" };
      if (feature.status !== "ready") return { error: "هذه الميزة «قريباً» ولا يمكن تفعيلها" };
      if (typeof args.enabled !== "boolean") return { error: "enabled يجب أن يكون true أو false" };
      return { payload: { key: feature.key, enabled: args.enabled, reason: str(args.reason, 300) || null } };
    }
    case "create_family": {
      const name = text(args.name, 100);
      if (!name) return { error: "اسم الأسرة مطلوب" };
      return { payload: { name, leaderName: text(args.leaderName, 100), notes: text(args.notes, 1000) } };
    }
    case "create_committee_task": {
      const committeeId = positiveInt(args.committeeId);
      if (committeeId === null) return { error: "committeeId يجب أن يكون رقماً موجباً" };
      const title = text(args.title, 200);
      if (!title) return { error: "عنوان المهمة مطلوب" };
      const dueDateRaw = str(args.dueDate, 10);
      if (dueDateRaw && !parseWeekStart(dueDateRaw)) return { error: "تاريخ الاستحقاق يجب أن يكون بصيغة YYYY-MM-DD" };
      return { payload: { committeeId, title, dueDate: dueDateRaw || null } };
    }
    case "award_badge": {
      const badgeId = positiveInt(args.badgeId);
      if (badgeId === null) return { error: "badgeId يجب أن يكون رقماً موجباً" };
      if (args.targetKind !== "student" && args.targetKind !== "family" && args.targetKind !== "member") {
        return { error: "targetKind يجب أن يكون student أو family أو member" };
      }
      const targetId = positiveInt(args.targetId);
      if (targetId === null) return { error: "targetId يجب أن يكون رقماً موجباً" };
      const awardedAtRaw = str(args.awardedAt, 10);
      if (awardedAtRaw && !parseWeekStart(awardedAtRaw)) return { error: "تاريخ المنح يجب أن يكون بصيغة YYYY-MM-DD" };
      return { payload: { badgeId, targetKind: args.targetKind, targetId, awardedAt: awardedAtRaw || null, note: text(args.note, 200) } };
    }
    case "add_schedule_slot": {
      // نفس مدقق خانات الجدول في المسار — refId يفحص انتماؤه للجامع عند التنفيذ
      const { slot, error } = parseSlotBody(args);
      if (!slot) return { error: error ?? "خانة الجدول غير صالحة" };
      return { payload: { ...slot } };
    }
    default:
      return { error: "أداة كتابة غير معروفة" };
  }
}

// ————— أدوات القراءة —————

async function safe<T>(call: () => Promise<T>): Promise<T | null> {
  try {
    return await call();
  } catch {
    return null;
  }
}

async function readHalaqahsWithMetrics(mosqueId: number): Promise<string> {
  const halaqahs = await listHalaqahs(mosqueId);
  if (halaqahs.length === 0) return "لا حلقات مربوطة بهذا الجامع";
  const week = currentWeekPeriod();
  const lines: string[] = [];
  for (const halaqah of halaqahs) {
    const stats = await safe(() => getHalaqahStats(halaqah.id));
    const metrics = await safe(() => getMetricsForHalaqah(halaqah, week.from, week.to));
    const parts = [
      stats ? `${stats.activeStudents} طالب نشط` : null,
      stats ? `إتقان ${stats.avgMastery}٪` : null,
      metrics?.totals.attendanceRate !== null && metrics?.totals.attendanceRate !== undefined ? `حضور ${metrics.totals.attendanceRate}٪` : null,
      metrics ? `تسميعات معتمدة ${metrics.totals.wardsApproved}` : null,
    ].filter(Boolean);
    lines.push(`- ${halaqah.halaqahName} (المعلم: ${halaqah.teacherName || "غير محدد"}): ${parts.join("، ") || "لا مقاييس"}`);
  }
  return `حلقات الجامع (أسبوع ${week.from} → ${week.to}):\n${lines.join("\n")}`;
}

async function readFindStudent(mosqueId: number, nameQuery: string): Promise<string> {
  const query = nameQuery.trim().slice(0, 100);
  if (query.length < 2) return "اكتب حرفين على الأقل للبحث";

  const [registrations, members, halaqahs] = await Promise.all([
    listMosqueRegistrations(mosqueId),
    listMosqueMembers(mosqueId),
    listHalaqahs(mosqueId),
  ]);
  const halaqahNames = new Map(halaqahs.map((h) => [h.id, h.halaqahName]));
  const matches = (person: { name: string }) => person.name.includes(query);

  // لا هواتف ولا معرّفات داخلية — ما يكفي للمساعد فقط
  const lines = [
    ...registrations
      .filter(matches)
      .slice(0, 10)
      .map(
        (r) =>
          `- طالب: ${r.name}${r.halaqahId !== null ? ` — حلقة ${halaqahNames.get(r.halaqahId) ?? r.halaqahId}` : ""} — ${
            r.status === "pending" ? "بانتظار التوزيع" : "موزَّع"
          } (تسجيل رقم ${r.id})`,
      ),
    ...members.filter(matches).slice(0, 10).map((m) => `- عضو: ${m.name}${m.roleNote ? ` — ${m.roleNote}` : ""} (عضو رقم ${m.id})`),
  ];
  return lines.length > 0 ? `نتائج البحث عن «${query}»:\n${lines.join("\n")}` : `لا نتائج عن «${query}» في هذا الجامع`;
}

function formatHonorBoard(payload: Awaited<ReturnType<typeof buildHonorBoard>>): string {
  const lines = [`لوحة الشرف ${payload.period.from} → ${payload.period.to}:`];
  if (payload.halaqahs.length > 0) {
    lines.push("ترتيب الحلقات:");
    for (const row of payload.halaqahs) {
      lines.push(
        `- ${row.rank !== null ? `${row.rank}. ` : ""}${row.name}${row.score !== null ? ` — درجة ${row.score}` : " — بلا مقاييس للفترة"}`,
      );
    }
  }
  if (payload.students.length > 0) {
    lines.push(`المتصدّرون (من ${payload.rankedStudents} طالب مرتّباً):`);
    for (const row of payload.students) {
      lines.push(`- ${row.rank}. ${row.name} (${row.halaqahName}) — درجة ${row.combinedScore}`);
    }
  }
  return lines.join("\n");
}

function formatReport(payload: Awaited<ReturnType<typeof buildMosqueReport>>): string {
  const k = payload.kpis;
  const pct = (value: number | null) => (value === null ? "غير متاح" : `${value}٪`);
  const lines = [
    `تقرير ${payload.period.from} → ${payload.period.to}:`,
    `- الحلقات: ${k.halaqatCount} (${k.unreachableHalaqat} متعذّرة القراءة)`,
    `- الطلاب النشطون: ${k.activeStudents}`,
    `- طلبات تسجيل بانتظار التوزيع: ${k.pendingRegistrations}`,
    `- الأسر: ${k.familiesCount} — اللجان: ${k.committeesCount} — المهام المفتوحة: ${k.openTasks}`,
    `- متوسط التقييم الأسبوعي: ${pct(k.evaluationsAvgPercent)}`,
    `- الأوسمة الممنوحة: ${k.badgesAwarded}${k.activities !== null ? ` — الأنشطة: ${k.activities}` : ""}`,
  ];
  if (payload.topStudents.length > 0) {
    lines.push(`أعلى الطلاب بالتقييم: ${payload.topStudents.map((row) => `${row.name} (${pct(row.percent)})`).join("، ")}`);
  }
  if (payload.topFamilies.length > 0) {
    lines.push(`أعلى الأسر بالتقييم: ${payload.topFamilies.map((row) => `${row.name} (${pct(row.percent)})`).join("، ")}`);
  }
  return lines.join("\n");
}

// ————— الصنف والمُوزِّع —————

export type AgentToolDispatch = {
  /** ما يُعاد للنموذج كنتيجة أداة */
  content: string;
  /** مقترح أُنشئ لهذه الاستدعاء (أدوات الكتابة فقط) */
  proposal?: AgentProposal;
};

/**
 * ينفّذ استدعاء أداة واحد. mosqueId من الجلسة حصراً: أي mosqueId مرسل
 * ضمن arguments يُتجاهل (يُحذف قبل التوزيع). الفشل لا يرمي — يعود نصاً.
 */
export async function dispatchAgentTool(
  mosqueId: number,
  userId: number | null,
  call: AgentToolCall,
): Promise<AgentToolDispatch> {
  const args = { ...(call.arguments ?? {}) };
  delete args.mosqueId; // الجامع من الجلسة فقط — ليس من النموذج

  try {
    switch (call.name) {
      case "get_mosque_overview":
        return { content: buildGraphContext(await buildMosqueGraph(mosqueId)) };

      case "list_halaqahs_with_metrics":
        return { content: await readHalaqahsWithMetrics(mosqueId) };

      case "find_student":
        return { content: await readFindStudent(mosqueId, str(args.name, 100)) };

      case "get_honor_board": {
        const period = resolvePeriod(toolPeriod(args.period), {}) ?? currentWeekPeriod();
        return { content: formatHonorBoard(await buildHonorBoard(mosqueId, period)) };
      }

      case "get_report": {
        const period = resolvePeriod(toolPeriod(args.period), {}) ?? currentWeekPeriod();
        return { content: formatReport(await buildMosqueReport(mosqueId, period)) };
      }

      case "list_features": {
        const features = await getMosqueFeatures(mosqueId);
        return {
          content: features
            .map(
              (f) =>
                `- ${f.nameAr} (${f.key}): ${f.enabled && f.status === "ready" ? "مفعّلة" : f.status === "soon" ? "قريباً — لا يمكن تفعيلها" : "معطّلة"}`,
            )
            .join("\n"),
        };
      }

      case "save_memory": {
        const content = str(args.content, AGENT_MEMORY_MAX_CHARS);
        if (!content) return { content: "الذاكرة فارغة — اكتب ما يُحفظ" };
        const memory = await saveAgentMemory(mosqueId, content, "agent");
        return { content: `حُفظت في ذاكرة الجامع (#${memory.id})` };
      }

      case "suggest_lesson": {
        const content = str(args.content, 1000);
        if (content.length < 10) return { content: "الدرس قصير جداً — اكتبه بصياغة أوضح" };
        const names = await listMosquePersonNames(mosqueId);
        const sanitized = sanitizeLesson(content, names);
        if (!sanitized || sanitized.replace(/[…\s]/g, "").length < 10) {
          return { content: "رُفض الدرس: تعذّر إخفاء هوية الأشخاص منه — أعد صياغته بلا أسماء ولا أرقام" };
        }
        const reason = lessonRejectionReason(sanitized, names);
        if (reason) return { content: `رُفض الدرس: ${reason} — أعد صياغته بلا معلومات تعرّف` };
        const lesson = await createAgentLesson(mosqueId, sanitized);
        return { content: `أُرسل الدرس للمطوّر للموافقة (#${lesson.id}) — لن يُشارك قبل ذلك` };
      }

      default: {
        if (!(WRITE_TOOL_KINDS as readonly string[]).includes(call.name)) {
          return { content: "أداة غير معروفة" };
        }
        const { payload, error } = validateWritePayload(call);
        if (!payload) return { content: error ?? "حمولة غير صالحة" };
        const proposal = await createAgentProposal(mosqueId, userId, call.name, payload);
        return {
          content: `أُنشئ مقترح #${proposal.id} «${describeProposal(proposal.kind, proposal.payload).title}» بانتظار موافقة المدير — لن يُنفَّذ إلا بضغط «نفّذ».`,
          proposal,
        };
      }
    }
  } catch (error) {
    console.error(`agent tool ${call.name} failed`, error);
    return { content: "تعذّر تنفيذ الأداة الآن — أعد المحاولة أو أجب مما تعرف" };
  }
}

// ————— وصف المقترحات لبطاقات المحادثة —————

/** عنوان وملخص عربيان لبطاقة المقترح في المحادثة (وعرضه بلوحة الجامع) */
export function describeProposal(kind: string, payload: Record<string, unknown>): { title: string; summary: string } {
  switch (kind) {
    case "toggle_feature": {
      const feature = getFeature(String(payload.key ?? ""));
      const name = feature?.nameAr ?? String(payload.key ?? "ميزة");
      return {
        title: payload.enabled === true ? `تفعيل ميزة «${name}»` : `تعطيل ميزة «${name}»`,
        summary: [payload.reason ? `السبب: ${String(payload.reason)}` : null].filter(Boolean).join(" — ") || name,
      };
    }
    case "create_family":
      return {
        title: `إنشاء أسرة «${String(payload.name ?? "")}»`,
        summary: [payload.leaderName ? `رئيس الأسرة: ${String(payload.leaderName)}` : null, payload.notes ? String(payload.notes) : null]
          .filter(Boolean)
          .join(" — ") || "أسرة جديدة بلا تفاصيل إضافية",
      };
    case "create_committee_task":
      return {
        title: `مهمة للجنة #${String(payload.committeeId ?? "؟")}`,
        summary: [String(payload.title ?? ""), payload.dueDate ? `تاريخ الاستحقاق: ${String(payload.dueDate)}` : null]
          .filter(Boolean)
          .join(" — "),
      };
    case "award_badge": {
      const kindAr = payload.targetKind === "family" ? "أسرة" : payload.targetKind === "member" ? "عضو" : "طالب";
      return {
        title: `منح وسام #${String(payload.badgeId ?? "؟")}`,
        summary: [`الهدف: ${kindAr} #${String(payload.targetId ?? "؟")}`, payload.note ? String(payload.note) : null]
          .filter(Boolean)
          .join(" — "),
      };
    }
    case "add_schedule_slot":
      return {
        title: `خانة جدول: ${String(payload.title ?? "")}`,
        summary: [
          `اليوم: ${dayLabel(Number(payload.dayOfWeek ?? 0))}`,
          `الفترة: ${periodLabel(String(payload.period ?? "other"))}`,
          payload.startTime ? `الوقت: ${String(payload.startTime)}` : null,
        ]
          .filter(Boolean)
          .join(" — "),
      };
    default:
      return { title: `مقترح ${kind}`, summary: JSON.stringify(payload).slice(0, 200) };
  }
}
