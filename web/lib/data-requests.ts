import "server-only";

import { db } from "@/lib/db";

/*
  طلبات حذف البيانات («طلب حذف بياناتي»). المستخدم يرفع الطلب من إعدادات دوره،
  والمطوّر يراجعه في /dev/data-requests وينفّذ الحذف يدوياً ثم يوسمه «منجز»
  (أو يرفضه بسبب). لا حذف آلياً هنا عمداً: الحذف قرار يُراجَع ويُدقَّق.
*/

export type DeletionRequesterKind = "teacher" | "parent" | "student" | "mosque_admin" | "association_admin";
export type DeletionRequestStatus = "pending" | "done" | "rejected";

export const DELETION_KIND_LABEL: Record<DeletionRequesterKind, string> = {
  teacher: "معلّم",
  parent: "ولي أمر",
  student: "طالب",
  mosque_admin: "مدير جامع",
  association_admin: "مدير جمعية",
};

export type DeletionRequest = {
  id: number;
  requesterKind: DeletionRequesterKind;
  requesterRef: string;
  displayName: string;
  note: string;
  status: DeletionRequestStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export const DELETION_NOTE_MAX = 500;

function rowToRequest(r: Record<string, unknown>): DeletionRequest {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: Number(r.id),
    requesterKind: r.requester_kind as DeletionRequesterKind,
    requesterRef: r.requester_ref as string,
    displayName: (r.display_name as string) ?? "",
    note: (r.note as string) ?? "",
    status: r.status as DeletionRequestStatus,
    decisionNote: (r.decision_note as string | null) ?? null,
    createdAt: iso(r.created_at) as string,
    decidedAt: iso(r.decided_at),
  };
}

const COLUMNS = `id, requester_kind, requester_ref, display_name, note, status, decision_note, created_at, decided_at`;

export type CreateDeletionResult = { ok: true; id: number; alreadyPending: boolean };

/**
 * يرفع طلباً جديداً. طلب معلّق قائم لنفس المستخدم لا يتكرر (الفهرس الفريد
 * الجزئي هو الحَكَم، فالنداء المكرر يرجع alreadyPending بدل خطأ).
 */
export async function createDeletionRequest(input: {
  kind: DeletionRequesterKind;
  ref: string;
  displayName: string;
  note: string;
}): Promise<CreateDeletionResult> {
  const rows = await db().sql`
    INSERT INTO data_deletion_requests (requester_kind, requester_ref, display_name, note)
    VALUES (${input.kind}, ${input.ref}, ${input.displayName}, ${input.note})
    ON CONFLICT (requester_kind, requester_ref) WHERE status = 'pending' DO NOTHING
    RETURNING id
  `;
  if (rows[0]) return { ok: true, id: Number(rows[0].id), alreadyPending: false };
  const existing = await db().sql`
    SELECT id FROM data_deletion_requests
    WHERE requester_kind = ${input.kind} AND requester_ref = ${input.ref} AND status = 'pending'
    LIMIT 1
  `;
  return { ok: true, id: Number(existing[0]?.id ?? 0), alreadyPending: true };
}

/** هل لهذا المستخدم طلب معلّق؟ (لإظهار «طلبك قيد المراجعة» في إعداداته) */
export async function hasPendingDeletionRequest(kind: DeletionRequesterKind, ref: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT 1 AS hit FROM data_deletion_requests
    WHERE requester_kind = ${kind} AND requester_ref = ${ref} AND status = 'pending' LIMIT 1
  `;
  return rows.length > 0;
}

export async function listDeletionRequests(): Promise<DeletionRequest[]> {
  const result = await db().pool.query(
    `SELECT ${COLUMNS} FROM data_deletion_requests
     ORDER BY (status = 'pending') DESC, created_at DESC, id DESC LIMIT 500`,
  );
  return result.rows.map(rowToRequest);
}

export async function countPendingDeletionRequests(): Promise<number> {
  const rows = await db().sql`SELECT COUNT(*)::int AS n FROM data_deletion_requests WHERE status = 'pending'`;
  return Number(rows[0]?.n ?? 0);
}

export type DecideDeletionResult = { ok: true } | { ok: false; code: "not_found" | "already_decided" };

/** يبتّ في طلب معلّق (done/rejected) مع ملاحظة، وسجل تدقيق بنفس الترانزاكشن */
export async function decideDeletionRequest(
  id: number,
  decision: "done" | "rejected",
  decisionNote: string,
): Promise<DecideDeletionResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(`SELECT status FROM data_deletion_requests WHERE id = $1 FOR UPDATE`, [id]);
    const row = found.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }
    if (row.status !== "pending") {
      await client.query("ROLLBACK");
      return { ok: false, code: "already_decided" };
    }
    await client.query(
      `UPDATE data_deletion_requests SET status = $2, decision_note = $3, decided_at = now() WHERE id = $1`,
      [id, decision, decisionNote],
    );
    await client.query(
      `INSERT INTO dev_audit_log (action, target_kind, target_id, details) VALUES ($1, 'data_request', $2, $3::jsonb)`,
      [`data_request.${decision}`, String(id), JSON.stringify({ decisionNote })],
    );
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
