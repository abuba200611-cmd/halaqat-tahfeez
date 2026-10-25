import "server-only";

import { db } from "@/lib/db";
import { ensureMosqueAdminIdentity } from "@/lib/identity";
import { verifyPassword } from "@/lib/mosque/password";
import type { MosqueRegistrationInput, RegistrationRequestStatus } from "@/lib/mosque-registration";

/*
  طبقة بيانات طلبات تسجيل الجوامع. الموافقة ترانزاكشن واحدة: قفل الطلب
  (FOR UPDATE) ← إنشاء الجامع ← مديره (+ هويته الموحّدة عبر ensureMosqueAdminIdentity
  نفسها التي يستخدمها upsertMosqueAdmin) ← ربط الجمعية ← حالة الطلب ← سجل التدقيق.
  القفل + فحص الحالة يجعلانها idempotent: الموافقة الثانية لا تنشئ شيئاً.
*/

export type RegistrationRequest = {
  id: number;
  mosqueName: string;
  city: string;
  applicantName: string;
  phone: string;
  email: string;
  username: string;
  associationName: string;
  status: RegistrationRequestStatus;
  rejectReason: string | null;
  mosqueId: number | null;
  associationId: number | null;
  createdAt: string;
  decidedAt: string | null;
};

function rowToRequest(r: Record<string, unknown>): RegistrationRequest {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: Number(r.id),
    mosqueName: r.mosque_name as string,
    city: r.city as string,
    applicantName: r.applicant_name as string,
    phone: r.phone as string,
    email: r.email as string,
    username: r.username as string,
    associationName: r.association_name as string,
    status: r.status as RegistrationRequestStatus,
    rejectReason: (r.reject_reason as string | null) ?? null,
    mosqueId: num(r.mosque_id),
    associationId: num(r.association_id),
    createdAt: iso(r.created_at) as string,
    decidedAt: iso(r.decided_at),
  };
}

const COLUMNS = `id, mosque_name, city, applicant_name, phone, email, username, association_name,
  status, reject_reason, mosque_id, association_id, created_at, decided_at`;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export type CreateRequestResult = { ok: true; id: number } | { ok: false; code: "username_taken" };

/** اسم المستخدم محجوز لمدير جامع قائم أو طلب معلّق آخر */
export async function usernameTaken(username: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT 1 AS hit FROM mosque_admins WHERE lower(username) = ${username}
    UNION ALL
    SELECT 1 FROM mosque_registration_requests WHERE username = ${username} AND status = 'pending'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function createRegistrationRequest(
  input: MosqueRegistrationInput,
  passwordHash: string,
): Promise<CreateRequestResult> {
  if (await usernameTaken(input.username)) return { ok: false, code: "username_taken" };
  try {
    // العمود requested_association_id (ترحيل D1) لا يُلمس إلا عند اختيار جمعية
    const rows = input.associationId
      ? await db().sql`
          INSERT INTO mosque_registration_requests
            (mosque_name, city, applicant_name, phone, email, username, password_hash, association_name,
             requested_association_id)
          VALUES (${input.mosqueName}, ${input.city}, ${input.applicantName}, ${input.phone}, ${input.email},
                  ${input.username}, ${passwordHash}, ${input.associationName}, ${input.associationId})
          RETURNING id
        `
      : await db().sql`
          INSERT INTO mosque_registration_requests
            (mosque_name, city, applicant_name, phone, email, username, password_hash, association_name)
          VALUES (${input.mosqueName}, ${input.city}, ${input.applicantName}, ${input.phone}, ${input.email},
                  ${input.username}, ${passwordHash}, ${input.associationName})
          RETURNING id
        `;
    return { ok: true, id: Number(rows[0].id) };
  } catch (error) {
    // سباق بين فحص الاسم والإدراج: الفهرس الفريد للمعلّق هو الحَكَم
    if (isUniqueViolation(error)) return { ok: false, code: "username_taken" };
    throw error;
  }
}

export async function listRegistrationRequests(): Promise<RegistrationRequest[]> {
  const result = await db().pool.query(
    `SELECT ${COLUMNS} FROM mosque_registration_requests
     ORDER BY (status = 'pending') DESC, created_at DESC, id DESC LIMIT 500`,
  );
  return result.rows.map(rowToRequest);
}

export async function countPendingRegistrationRequests(): Promise<number> {
  const rows = await db().sql`SELECT COUNT(*)::int AS n FROM mosque_registration_requests WHERE status = 'pending'`;
  return Number(rows[0]?.n ?? 0);
}

export type LoginRequestStatus = { status: "pending" | "rejected"; reason: string | null };

/**
 * عند فشل دخول مدير الجامع: هل بيانات الدخول المُدخلة هي بيانات طلب تسجيل
 * معلّق أو مرفوض؟ (أحدث طلب بهذا الاسم، وكلمة المرور تُتحقَّق من بصمته.)
 * يرجع null لأي حال أخرى فلا تتسرّب حالة طلب لمن لا يملك كلمة مروره.
 */
export async function loginRequestStatus(username: string, password: string): Promise<LoginRequestStatus | null> {
  const rows = await db().sql`
    SELECT status, reject_reason, password_hash FROM mosque_registration_requests
    WHERE username = ${username} AND status IN ('pending', 'rejected')
    ORDER BY id DESC LIMIT 1
  `;
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash as string)) return null;
  return { status: row.status as "pending" | "rejected", reason: (row.reject_reason as string | null) ?? null };
}

export type ApproveResult =
  | { ok: true; mosqueId: number; adminId: number; associationId: number | null }
  | { ok: false; code: "not_found" | "already_decided" | "username_taken" | "association_not_found" };

type Tx = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

async function writeAudit(client: Tx, action: string, id: number, details: Record<string, unknown>) {
  await client.query(
    `INSERT INTO dev_audit_log (action, target_kind, target_id, details) VALUES ($1, 'mosque_request', $2, $3::jsonb)`,
    [action, String(id), JSON.stringify(details)],
  );
}

/**
 * يوافق على طلب معلّق. associationId الممرَّر صراحةً يتقدّم على المطابقة
 * بالاسم؛ وإلا نطابق association_name بجمعية واحدة بالضبط دون حساسية لحالة الأحرف.
 */
export async function approveRegistrationRequest(
  id: number,
  options: { associationId?: number | null } = {},
): Promise<ApproveResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT *
       FROM mosque_registration_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );
    const req = found.rows[0];
    if (!req) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }
    if (req.status !== "pending") {
      await client.query("ROLLBACK");
      return { ok: false, code: "already_decided" };
    }

    const username = req.username as string;
    const existing = await client.query(`SELECT 1 FROM mosque_admins WHERE lower(username) = $1`, [username]);
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: "username_taken" };
    }

    let associationId: number | null = null;
    if (options.associationId !== undefined && options.associationId !== null) {
      const assoc = await client.query(`SELECT id FROM associations WHERE id = $1`, [options.associationId]);
      if (assoc.rows.length === 0) {
        await client.query("ROLLBACK");
        return { ok: false, code: "association_not_found" };
      }
      associationId = Number(assoc.rows[0].id);
    } else if ((req.association_name as string).trim()) {
      const matches = await client.query(
        `SELECT id FROM associations WHERE lower(btrim(name)) = lower(btrim($1)) LIMIT 2`,
        [req.association_name],
      );
      if (matches.rows.length === 1) associationId = Number(matches.rows[0].id);
    }

    const mosque = await client.query(
      `INSERT INTO mosques (name, city, association_id) VALUES ($1, $2, $3) RETURNING id`,
      [req.mosque_name, req.city, associationId],
    );
    const mosqueId = Number(mosque.rows[0].id);
    const admin = await client.query(
      `INSERT INTO mosque_admins (mosque_id, username, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [mosqueId, username, req.password_hash],
    );
    const adminId = Number(admin.rows[0].id);
    await ensureMosqueAdminIdentity(client, { id: adminId, mosqueId, username });

    // جمعية اختارها مقدّم الطلب نفسه: ربط معلّق تقرره الجمعية (لا ربط مباشر).
    // اختيار المطوّر الصريح أو مطابقة الاسم أعلاه يربطان فوراً كما كان.
    let pendingLinkAssociationId: number | null = null;
    const requestedAssociationId = req.requested_association_id ? Number(req.requested_association_id) : null;
    if (requestedAssociationId && associationId === null) {
      const exists = await client.query(`SELECT id FROM associations WHERE id = $1`, [requestedAssociationId]);
      if (exists.rows.length > 0) {
        await client.query(
          `INSERT INTO mosque_association_links (mosque_id, association_id, requested_by)
           VALUES ($1, $2, 'mosque') ON CONFLICT (mosque_id, association_id) DO NOTHING`,
          [mosqueId, requestedAssociationId],
        );
        pendingLinkAssociationId = requestedAssociationId;
      }
    }

    await client.query(
      `UPDATE mosque_registration_requests
       SET status = 'approved', mosque_id = $2, association_id = $3, decided_at = now()
       WHERE id = $1`,
      [id, mosqueId, associationId],
    );
    await writeAudit(client, "mosque_request.approve", id, { mosqueId, adminId, associationId, username, pendingLinkAssociationId });
    await client.query("COMMIT");
    return { ok: true, mosqueId, adminId, associationId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (isUniqueViolation(error)) return { ok: false, code: "username_taken" };
    throw error;
  } finally {
    client.release();
  }
}

export type RejectResult = { ok: true } | { ok: false; code: "not_found" | "already_decided" };

export async function rejectRegistrationRequest(id: number, reason: string): Promise<RejectResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(`SELECT status FROM mosque_registration_requests WHERE id = $1 FOR UPDATE`, [id]);
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
      `UPDATE mosque_registration_requests SET status = 'rejected', reject_reason = $2, decided_at = now() WHERE id = $1`,
      [id, reason],
    );
    await writeAudit(client, "mosque_request.reject", id, { reason });
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
