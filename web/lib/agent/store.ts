import "server-only";

import { db } from "@/lib/db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/*
  M6 — طبقة الوصول لجداول الإيجنت الأربعة فوق موصّل @/lib/db نفسه.
  كل استعلام يحمل mosque_id من الجلسة (لا من مدخلات النموذج)، وكل
  قرار على مقترح/درس ذرّي بشرط status = 'pending' فلا يُحسم مرتين.
*/

// ————— المقترحات (أدوات الكتابة لا تُنفَّذ، تُقترح) —————

export type AgentProposalStatus = "pending" | "executing" | "approved" | "rejected" | "failed";

export type AgentProposal = {
  id: number;
  mosqueId: number;
  userId: number | null;
  kind: string;
  payload: Record<string, unknown>;
  status: AgentProposalStatus;
  createdAt: string;
  decidedAt: string | null;
};

function rowToProposal(row: Record<string, unknown>): AgentProposal {
  const raw = row.payload;
  const payload: Record<string, unknown> =
    typeof raw === "string" ? (JSON.parse(raw) as Record<string, unknown>) : ((raw ?? {}) as Record<string, unknown>);
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    userId: (row.user_id as number | null) ?? null,
    kind: row.kind as string,
    payload,
    status: row.status as AgentProposalStatus,
    createdAt: row.created_at as string,
    decidedAt: (row.decided_at as string | null) ?? null,
  };
}

export async function createAgentProposal(
  mosqueId: number,
  userId: number | null,
  kind: string,
  payload: Record<string, unknown>,
): Promise<AgentProposal> {
  const rows = await db().sql`
    INSERT INTO agent_proposals (mosque_id, user_id, kind, payload)
    VALUES (${mosqueId}, ${userId}, ${kind}, ${JSON.stringify(payload)}::jsonb)
    RETURNING id, mosque_id, user_id, kind, payload, status, created_at, decided_at
  `;
  return rowToProposal(rows[0]);
}

/** أحدث مقترحات الجامع لعرضها كبطاقات عند فتح المحادثة */
export async function listRecentAgentProposals(mosqueId: number, limit = 10): Promise<AgentProposal[]> {
  const rows = await db().sql`
    SELECT id, mosque_id, user_id, kind, payload, status, created_at, decided_at
    FROM agent_proposals
    WHERE mosque_id = ${mosqueId}
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToProposal);
}

export async function getAgentProposal(mosqueId: number, id: number): Promise<AgentProposal | null> {
  const rows = await db().sql`
    SELECT id, mosque_id, user_id, kind, payload, status, created_at, decided_at
    FROM agent_proposals
    WHERE mosque_id = ${mosqueId} AND id = ${id}
  `;
  return rows[0] ? rowToProposal(rows[0]) : null;
}

/**
 * رفض مقترح — ذرّي: ينجح فقط وهو pending وبهذا الجامع، وإلا null.
 */
export async function setAgentProposalStatus(
  mosqueId: number,
  id: number,
  status: "rejected",
): Promise<AgentProposal | null> {
  const rows = await db().sql`
    UPDATE agent_proposals SET status = ${status}, decided_at = now()
    WHERE mosque_id = ${mosqueId} AND id = ${id} AND status = 'pending'
    RETURNING id, mosque_id, user_id, kind, payload, status, created_at, decided_at
  `;
  return rows[0] ? rowToProposal(rows[0]) : null;
}

/**
 * حجز مقترح للتنفيذ — ذرّي: pending → executing لطلب واحد فقط. من يخسر
 * السباق يحصل على null فلا يُنفَّذ المقترح مرتين.
 */
export async function claimAgentProposal(mosqueId: number, id: number): Promise<AgentProposal | null> {
  const rows = await db().sql`
    UPDATE agent_proposals SET status = 'executing'
    WHERE mosque_id = ${mosqueId} AND id = ${id} AND status = 'pending'
    RETURNING id, mosque_id, user_id, kind, payload, status, created_at, decided_at
  `;
  return rows[0] ? rowToProposal(rows[0]) : null;
}

/** إنهاء مقترح محجوز: executing → approved | failed، ويرفع decided_at */
export async function finishAgentProposal(
  mosqueId: number,
  id: number,
  status: "approved" | "failed",
): Promise<AgentProposal | null> {
  const rows = await db().sql`
    UPDATE agent_proposals SET status = ${status}, decided_at = now()
    WHERE mosque_id = ${mosqueId} AND id = ${id} AND status = 'executing'
    RETURNING id, mosque_id, user_id, kind, payload, status, created_at, decided_at
  `;
  return rows[0] ? rowToProposal(rows[0]) : null;
}

// ————— ذاكرة الجامع —————

export const MAX_AGENT_MEMORIES_PER_MOSQUE = 200;
export const AGENT_MEMORY_MAX_CHARS = 500;
/** ما يُحقن بالسياق — الأحدث أولاً ثم يُعكس ليقرأه النموذج بالترتيب الزمني */
export const AGENT_MEMORIES_IN_CONTEXT = 30;

export type AgentMemory = { id: number; mosqueId: number; content: string; source: "agent" | "admin"; createdAt: string };

export async function saveAgentMemory(
  mosqueId: number,
  content: string,
  source: "agent" | "admin",
): Promise<AgentMemory> {
  const rows = await db().sql`
    INSERT INTO agent_memories (mosque_id, content, source)
    VALUES (${mosqueId}, ${content.slice(0, AGENT_MEMORY_MAX_CHARS)}, ${source})
    RETURNING id, mosque_id, content, source, created_at
  `;
  const row = rows[0];

  // تقليم الأقدم فوق السقف — يعمل بعد الإدراج فيبقى السقف قائماً دائماً
  await db().sql`
    DELETE FROM agent_memories
    WHERE mosque_id = ${mosqueId} AND id NOT IN (
      SELECT id FROM agent_memories WHERE mosque_id = ${mosqueId}
      ORDER BY id DESC LIMIT ${MAX_AGENT_MEMORIES_PER_MOSQUE}
    )
  `;

  return { id: row.id as number, mosqueId, content: row.content as string, source, createdAt: row.created_at as string };
}

export async function listAgentMemories(mosqueId: number, limit = AGENT_MEMORIES_IN_CONTEXT): Promise<AgentMemory[]> {
  const rows = await db().sql`
    SELECT id, mosque_id, content, source, created_at
    FROM agent_memories
    WHERE mosque_id = ${mosqueId}
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    content: row.content as string,
    source: row.source as "agent" | "admin",
    createdAt: row.created_at as string,
  }));
}

// ————— الدليل المشترك (الدروس) —————

export const AGENT_LESSONS_IN_CONTEXT = 50;

export type AgentLesson = {
  id: number;
  content: string;
  fromMosqueId: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt: string | null;
};

function rowToLesson(row: Record<string, unknown>): AgentLesson {
  return {
    id: row.id as number,
    content: row.content as string,
    fromMosqueId: row.from_mosque_id as number,
    status: row.status as AgentLesson["status"],
    createdAt: row.created_at as string,
    decidedAt: (row.decided_at as string | null) ?? null,
  };
}

export async function createAgentLesson(fromMosqueId: number, content: string): Promise<AgentLesson> {
  const rows = await db().sql`
    INSERT INTO agent_lessons (content, from_mosque_id)
    VALUES (${content}, ${fromMosqueId})
    RETURNING id, content, from_mosque_id, status, created_at, decided_at
  `;
  return rowToLesson(rows[0]);
}

/** للمطوّر في /dev — بكل الحالات واسم الجامع المقترح */
export async function listAgentLessonsForDev(): Promise<(AgentLesson & { fromMosqueName: string })[]> {
  const rows = await db().sql`
    SELECT l.id, l.content, l.from_mosque_id, l.status, l.created_at, l.decided_at, m.name AS from_mosque_name
    FROM agent_lessons l JOIN mosques m ON m.id = l.from_mosque_id
    ORDER BY l.id DESC
    LIMIT 200
  `;
  return rows.map((row) => ({ ...rowToLesson(row), fromMosqueName: row.from_mosque_name as string }));
}

/** حسم درس — ذرّي من pending فقط */
export async function decideAgentLesson(
  id: number,
  status: "approved" | "rejected",
): Promise<AgentLesson | null> {
  const rows = await db().sql`
    UPDATE agent_lessons SET status = ${status}, decided_at = now()
    WHERE id = ${id} AND status = 'pending'
    RETURNING id, content, from_mosque_id, status, created_at, decided_at
  `;
  return rows[0] ? rowToLesson(rows[0]) : null;
}

/** الدروس المعتمدة الأحدث — تُحقن بسياق كل الجوامع */
export async function listApprovedAgentLessons(limit = AGENT_LESSONS_IN_CONTEXT): Promise<AgentLesson[]> {
  const rows = await db().sql`
    SELECT id, content, from_mosque_id, status, created_at, decided_at
    FROM agent_lessons
    WHERE status = 'approved'
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToLesson);
}

// ————— احتساب التوكنات —————

/** تجميع استهلاك اليوم (بتوقيت الرياض) لجامع — upsert واحد */
export async function logAgentUsage(mosqueId: number, inputTokens: number, outputTokens: number): Promise<void> {
  await db().sql`
    INSERT INTO agent_usage (mosque_id, day, input_tokens, output_tokens)
    VALUES (${mosqueId}, ${riyadhTodayISO()}::date, ${inputTokens}, ${outputTokens})
    ON CONFLICT (mosque_id, day) DO UPDATE SET
      input_tokens = agent_usage.input_tokens + excluded.input_tokens,
      output_tokens = agent_usage.output_tokens + excluded.output_tokens
  `;
}

// ————— أسماء أشخاص الجامع (لمنظّف الدروس) —————

/**
 * أسماء الأشخاص المسجّلين بجامع: تسجيلات الطلاب، الأعضاء الأحرار،
 * ومعلمو حلقاته — لأجل إخفائها من دروس الدليل المشترك.
 */
export async function listMosquePersonNames(mosqueId: number): Promise<string[]> {
  const rows = await db().sql`
    SELECT name FROM mosque_registrations WHERE mosque_id = ${mosqueId}
    UNION ALL
    SELECT name FROM mosque_members WHERE mosque_id = ${mosqueId}
    UNION ALL
    SELECT t.teacher_name AS name
    FROM teachers t JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE h.mosque_id = ${mosqueId} AND t.teacher_name != ''
  `;
  return rows.map((row) => row.name as string).filter((name) => name && name.trim().length > 0);
}
