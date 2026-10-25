import "server-only";

import { db } from "@/lib/db";
import { ensureAssociationAdminIdentity } from "@/lib/identity";
import { verifyPassword } from "@/lib/mosque/password";
import type { AssociationRegistrationInput, AssociationRequestStatus } from "@/lib/association-registration";

/*
  طبقة بيانات طلبات تسجيل الجمعيات — نفس بنية mosque-registration-db.ts:
  الموافقة ترانزاكشن واحدة (قفل الطلب FOR UPDATE ← إنشاء الجمعية ← مديرها
  + هويته الموحّدة ← حالة الطلب ← سجل التدقيق)، والقفل + فحص الحالة يجعلانها
  idempotent: الموافقة الثانية لا تنشئ شيئاً.
*/

export type AssociationRegistrationRequest = {
  id: number;
  associationName: string;
  registrationNumber: string;
  region: string;
  applicantName: string;
  phone: string;
  email: string;
  username: string;
  status: AssociationRequestStatus;
  rejectReason: string | null;
  associationId: number | null;
  adminId: number | null;
  createdAt: string;
  decidedAt: string | null;
};

function rowToRequest(r: Record<string, unknown>): AssociationRegistrationRequest {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    id: Number(r.id),
    associationName: r.association_name as string,
    registrationNumber: (r.registration_number as string) ?? "",
    region: (r.region as string) ?? "",
    applicantName: r.applicant_name as string,
    phone: r.phone as string,
    email: r.email as string,
    username: r.username as string,
    status: r.status as AssociationRequestStatus,
    rejectReason: (r.reject_reason as string | null) ?? null,
    associationId: num(r.association_id),
    adminId: num(r.admin_id),
    createdAt: iso(r.created_at) as string,
    decidedAt: iso(r.decided_at),
  };
}

const COLUMNS = `id, association_name, registration_number, region, applicant_name, phone, email, username,
  status, reject_reason, association_id, admin_id, created_at, decided_at`;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

export type CreateAssociationRequestResult = { ok: true; id: number } | { ok: false; code: "username_taken" };

/** اسم المستخدم محجوز لمدير جمعية قائم أو طلب معلّق آخر */
export async function associationUsernameTaken(username: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT 1 AS hit FROM association_admins WHERE lower(username) = ${username}
    UNION ALL
    SELECT 1 FROM association_registration_requests WHERE username = ${username} AND status = 'pending'
    LIMIT 1
  `;
  return rows.length > 0;
}

export async function createAssociationRegistrationRequest(
  input: AssociationRegistrationInput,
  passwordHash: string,
): Promise<CreateAssociationRequestResult> {
  if (await associationUsernameTaken(input.username)) return { ok: false, code: "username_taken" };
  try {
    const rows = await db().sql`
      INSERT INTO association_registration_requests
        (association_name, registration_number, region, applicant_name, phone, email, username, password_hash)
      VALUES (${input.associationName}, ${input.registrationNumber}, ${input.region}, ${input.applicantName},
              ${input.phone}, ${input.email}, ${input.username}, ${passwordHash})
      RETURNING id
    `;
    return { ok: true, id: Number(rows[0].id) };
  } catch (error) {
    // سباق بين فحص الاسم والإدراج: الفهرس الفريد للمعلّق هو الحَكَم
    if (isUniqueViolation(error)) return { ok: false, code: "username_taken" };
    throw error;
  }
}

export async function listAssociationRegistrationRequests(): Promise<AssociationRegistrationRequest[]> {
  const result = await db().pool.query(
    `SELECT ${COLUMNS} FROM association_registration_requests
     ORDER BY (status = 'pending') DESC, created_at DESC, id DESC LIMIT 500`,
  );
  return result.rows.map(rowToRequest);
}

export async function countPendingAssociationRequests(): Promise<number> {
  const rows = await db().sql`SELECT COUNT(*)::int AS n FROM association_registration_requests WHERE status = 'pending'`;
  return Number(rows[0]?.n ?? 0);
}

export type AssociationLoginRequestStatus = { status: "pending" | "rejected"; reason: string | null };

/**
 * عند فشل دخول مدير الجمعية: هل البيانات المُدخلة بياناتُ طلب تسجيل معلّق أو
 * مرفوض؟ (أحدث طلب بهذا الاسم، وكلمة المرور تُتحقَّق من بصمته — فلا تتسرّب
 * حالة طلب لمن لا يملك كلمة مروره.)
 */
export async function associationLoginRequestStatus(
  username: string,
  password: string,
): Promise<AssociationLoginRequestStatus | null> {
  const rows = await db().sql`
    SELECT status, reject_reason, password_hash FROM association_registration_requests
    WHERE username = ${username} AND status IN ('pending', 'rejected')
    ORDER BY id DESC LIMIT 1
  `;
  const row = rows[0];
  if (!row || !verifyPassword(password, row.password_hash as string)) return null;
  return { status: row.status as "pending" | "rejected", reason: (row.reject_reason as string | null) ?? null };
}

export type ApproveAssociationResult =
  | { ok: true; associationId: number; adminId: number }
  | { ok: false; code: "not_found" | "already_decided" | "username_taken" };

type Tx = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

async function writeAudit(client: Tx, action: string, id: number, details: Record<string, unknown>) {
  await client.query(
    `INSERT INTO dev_audit_log (action, target_kind, target_id, details) VALUES ($1, 'association_request', $2, $3::jsonb)`,
    [action, String(id), JSON.stringify(details)],
  );
}

/** يوافق على طلب معلّق: الجمعية + مديرها + الهوية + الحالة + التدقيق بترانزاكشن واحدة */
export async function approveAssociationRegistrationRequest(id: number): Promise<ApproveAssociationResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id, association_name, region, username, password_hash, status
       FROM association_registration_requests WHERE id = $1 FOR UPDATE`,
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
    const existing = await client.query(`SELECT 1 FROM association_admins WHERE lower(username) = $1`, [username]);
    if (existing.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: "username_taken" };
    }

    const association = await client.query(
      `INSERT INTO associations (name, city) VALUES ($1, $2) RETURNING id`,
      [req.association_name, req.region],
    );
    const associationId = Number(association.rows[0].id);
    const admin = await client.query(
      `INSERT INTO association_admins (association_id, username, password_hash) VALUES ($1, $2, $3) RETURNING id`,
      [associationId, username, req.password_hash],
    );
    const adminId = Number(admin.rows[0].id);
    await ensureAssociationAdminIdentity(client, { id: adminId, username });

    await client.query(
      `UPDATE association_registration_requests
       SET status = 'approved', association_id = $2, admin_id = $3, decided_at = now()
       WHERE id = $1`,
      [id, associationId, adminId],
    );
    await writeAudit(client, "association_request.approve", id, { associationId, adminId, username });
    await client.query("COMMIT");
    return { ok: true, associationId, adminId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    if (isUniqueViolation(error)) return { ok: false, code: "username_taken" };
    throw error;
  } finally {
    client.release();
  }
}

export type RejectAssociationResult = { ok: true } | { ok: false; code: "not_found" | "already_decided" };

export async function rejectAssociationRegistrationRequest(id: number, reason: string): Promise<RejectAssociationResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT status FROM association_registration_requests WHERE id = $1 FOR UPDATE`,
      [id],
    );
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
      `UPDATE association_registration_requests SET status = 'rejected', reject_reason = $2, decided_at = now() WHERE id = $1`,
      [id, reason],
    );
    await writeAudit(client, "association_request.reject", id, { reason });
    await client.query("COMMIT");
    return { ok: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
