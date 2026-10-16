import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { ensureParentIdentity } from "./identity";
import type { PushSubscriptionData } from "./types";

/*
  STEP 61 — حسابات أولياء الأمور. كل الوصول لجداول parents وparent_children
  وparent_link_tokens وparent_push_subscriptions يمرّ من هنا. معرّفا الحلقة
  والطالب (halaqah_id, student_id) يطابقان students(teacher_id, id).
*/

export const PARENT_LINK_TOKEN_TTL_DAYS = 7; // مدة صلاحية رابط دعوة ولي الأمر — ثابت واحد سهل التعديل

export type Parent = {
  id: number;
  email: string;
  name: string;
  sessionVersion: number;
};

export type ParentChild = {
  halaqahId: number;
  studentId: string;
  studentName: string;
  halaqahName: string;
};

/** البريد بحروف صغيرة ومقصوصاً — القيد UNIQUE والـCHECK في الجدول يفترضان ذلك */
export function normalizeParentEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidParentEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** SHA-256 للرمز — هذا فقط ما يُخزَّن، الرمز الخام يُسلَّم لصاحب الدعوة مرة واحدة */
export function hashParentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function pgErrorCode(error: unknown): string | undefined {
  // db().sql يغلّف خطأ Postgres الحقيقي بـ.cause بدل code مباشر — نتحقق من الموضعين
  const err = error as { code?: string; cause?: { code?: string } } | null;
  return err?.code ?? err?.cause?.code;
}

function rowToParent(row: Record<string, unknown>): Parent {
  return {
    id: Number(row.id),
    email: row.email as string,
    name: row.name as string,
    sessionVersion: Number(row.session_version ?? 0),
  };
}

// ————— الحساب —————

/** ينشئ حساباً جديداً؛ null إن كان البريد مسجّلاً سابقاً. هوية M5
 * (user+membership) تنشآن بترانزاكشن الحساب نفسها — بريد مطابق لبريد معلّم
 * يعيد استخدام مستخدمه فيصبح الشخص واحداً بعضويتين. */
export async function createParent(email: string, name: string, passwordHash: string): Promise<number | null> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query(
      `INSERT INTO parents (email, name, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, name, passwordHash],
    );
    if (!rows.rows[0]) {
      await client.query("COMMIT");
      return null;
    }
    const id = Number(rows.rows[0].id);
    await ensureParentIdentity(client, { id, email, name });
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findParentByEmail(email: string): Promise<(Parent & { passwordHash: string }) | null> {
  const rows = await db().sql`
    SELECT id, email, name, session_version, password_hash FROM parents WHERE email = ${email}
  `;
  const row = rows[0];
  return row ? { ...rowToParent(row), passwordHash: row.password_hash as string } : null;
}

export async function findParentById(id: number): Promise<Parent | null> {
  const rows = await db().sql`
    SELECT id, email, name, session_version FROM parents WHERE id = ${id}
  `;
  return rows[0] ? rowToParent(rows[0]) : null;
}

export async function parentSessionVersion(id: number): Promise<number> {
  const rows = await db().sql`SELECT session_version FROM parents WHERE id = ${id}`;
  return Number(rows[0]?.session_version ?? 0);
}

// ————— رموز الدعوة —————

export type ParentLinkTokenIssued = { token: string; expiresAt: string };

/**
 * يصدر رابط دعوة لمرة واحدة لطالب داخل الحلقة المحدَّدة. halaqahId وstudentId
 * يأتيان من جلسة المُصدِر حصراً (معلّم: حلقته + studentId يُتحقَّق منه بالـFK؛
 * طالب: هويته هو). الـFK المركّب يرفض أي طالب لا ينتمي للحلقة (23503) → null.
 * يُخزَّن SHA-256 فقط.
 */
export async function createParentLinkToken(input: {
  halaqahId: number;
  studentId: string;
  createdBy: "teacher" | "student";
}): Promise<ParentLinkTokenIssued | null> {
  const token = randomBytes(24).toString("base64url"); // ١٩٢ بت إنتروبيا
  const expiresAt = new Date(Date.now() + PARENT_LINK_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  try {
    await db().sql`
      INSERT INTO parent_link_tokens (token_hash, halaqah_id, student_id, created_by, expires_at)
      VALUES (${hashParentToken(token)}, ${input.halaqahId}, ${input.studentId}, ${input.createdBy}, ${expiresAt.toISOString()})
    `;
  } catch (error) {
    if (pgErrorCode(error) === "23503") return null;
    throw error;
  }
  return { token, expiresAt: expiresAt.toISOString() };
}

/** بيانات الرابط لشاشة التأكيد — null إن كان غير موجود أو مستخدَماً أو منتهياً */
export async function peekParentLinkToken(
  token: string,
): Promise<{ studentName: string; halaqahName: string } | null> {
  const rows = await db().sql`
    SELECT s.name AS student_name, h.name AS halaqah_name
    FROM parent_link_tokens t
    JOIN students s ON s.teacher_id = t.halaqah_id AND s.id = t.student_id
    JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE t.token_hash = ${hashParentToken(token)}
      AND t.used_at IS NULL AND t.expires_at > now() AND s.deleted_at IS NULL
  `;
  const row = rows[0];
  return row ? { studentName: row.student_name as string, halaqahName: row.halaqah_name as string } : null;
}

/**
 * يستهلك الرمز ويربط الحساب بالطالب في جملة واحدة ذرّية: لا يُستهلك الرمز
 * دون إنشاء الربط، ولا يُستهلك مرتين (used_at IS NULL) ولا بعد انتهائه.
 * الربط المكرَّر (ولي مرتبط أصلاً) يُتجاهَل بلا خطأ.
 */
export async function consumeParentLinkToken(
  token: string,
  parentId: number,
): Promise<{ halaqahId: number; studentId: string } | null> {
  const rows = await db().sql`
    WITH t AS (
      UPDATE parent_link_tokens SET used_at = now()
      WHERE token_hash = ${hashParentToken(token)} AND used_at IS NULL AND expires_at > now()
      RETURNING halaqah_id, student_id
    ), ins AS (
      INSERT INTO parent_children (parent_id, halaqah_id, student_id)
      SELECT ${parentId}, halaqah_id, student_id FROM t
      ON CONFLICT DO NOTHING
    )
    SELECT halaqah_id, student_id FROM t
  `;
  const row = rows[0];
  return row ? { halaqahId: Number(row.halaqah_id), studentId: row.student_id as string } : null;
}

// ————— الأبناء —————

function rowToChild(row: Record<string, unknown>): ParentChild {
  return {
    halaqahId: Number(row.halaqah_id),
    studentId: row.student_id as string,
    studentName: row.student_name as string,
    halaqahName: row.halaqah_name as string,
  };
}

/** أبناء ولي الأمر (دون المحذوفين) — لا شيء غير الاسم والحلقة */
export async function listParentChildren(parentId: number): Promise<ParentChild[]> {
  const rows = await db().sql`
    SELECT pc.halaqah_id, pc.student_id, s.name AS student_name, h.name AS halaqah_name
    FROM parent_children pc
    JOIN students s ON s.teacher_id = pc.halaqah_id AND s.id = pc.student_id
    JOIN halaqahs h ON h.id = pc.halaqah_id
    WHERE pc.parent_id = ${parentId} AND s.deleted_at IS NULL
    ORDER BY pc.created_at, s.name
  `;
  return rows.map(rowToChild);
}

/** ابن واحد بشرط أن يكون مرتبطاً فعلاً بهذا الولي — وإلا null (المستدعي يردّ 404) */
export async function getParentChild(
  parentId: number,
  halaqahId: number,
  studentId: string,
): Promise<ParentChild | null> {
  const rows = await db().sql`
    SELECT pc.halaqah_id, pc.student_id, s.name AS student_name, h.name AS halaqah_name
    FROM parent_children pc
    JOIN students s ON s.teacher_id = pc.halaqah_id AND s.id = pc.student_id
    JOIN halaqahs h ON h.id = pc.halaqah_id
    WHERE pc.parent_id = ${parentId} AND pc.halaqah_id = ${halaqahId} AND pc.student_id = ${studentId}
      AND s.deleted_at IS NULL
  `;
  return rows[0] ? rowToChild(rows[0]) : null;
}

export type StudentParentInfo = { parentId: number; name: string; email: string };

/** أولياء أمور طلاب حلقة — لعرض العدّاد وفكّ الربط عند المعلّم، مجمّعة بمعرّف الطالب */
export async function listHalaqahStudentParents(halaqahId: number): Promise<Record<string, StudentParentInfo[]>> {
  const rows = await db().sql`
    SELECT pc.student_id, p.id AS parent_id, p.name, p.email
    FROM parent_children pc
    JOIN parents p ON p.id = pc.parent_id
    WHERE pc.halaqah_id = ${halaqahId}
    ORDER BY pc.created_at
  `;
  const grouped: Record<string, StudentParentInfo[]> = {};
  for (const r of rows) {
    const key = r.student_id as string;
    (grouped[key] ??= []).push({ parentId: Number(r.parent_id), name: r.name as string, email: r.email as string });
  }
  return grouped;
}

/** فكّ ربط ولي بطالب داخل الحلقة المحدَّدة — true إن حُذف ربط فعلاً */
export async function unlinkParentFromStudent(
  halaqahId: number,
  studentId: string,
  parentId: number,
): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM parent_children
    WHERE halaqah_id = ${halaqahId} AND student_id = ${studentId} AND parent_id = ${parentId}
    RETURNING parent_id
  `;
  return rows.length > 0;
}

// ————— إشعارات ولي الأمر —————

export async function saveParentPushSubscription(parentId: number, sub: PushSubscriptionData): Promise<void> {
  await db().sql`
    INSERT INTO parent_push_subscriptions (parent_id, endpoint, p256dh, auth)
    VALUES (${parentId}, ${sub.endpoint}, ${sub.p256dh}, ${sub.auth})
    ON CONFLICT (endpoint) DO UPDATE SET
      parent_id = excluded.parent_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth
  `;
}

/** حذف مشروط بمالك الاشتراك — endpoint وحده لا يكفي */
export async function deleteParentPushSubscription(parentId: number, endpoint: string): Promise<void> {
  await db().sql`
    DELETE FROM parent_push_subscriptions WHERE endpoint = ${endpoint} AND parent_id = ${parentId}
  `;
}

export type ParentPushTarget = PushSubscriptionData & { parentId: number; studentName: string };

/** كل أجهزة كل أولياء طالب بعينه (مع اسمه لنص الإشعار) — للإشعار عند اعتماد/مراجعة ورده */
export async function listParentPushTargetsForStudent(
  halaqahId: number,
  studentId: string,
): Promise<ParentPushTarget[]> {
  const rows = await db().sql`
    SELECT pps.endpoint, pps.p256dh, pps.auth, pc.parent_id, s.name AS student_name
    FROM parent_children pc
    JOIN parent_push_subscriptions pps ON pps.parent_id = pc.parent_id
    JOIN students s ON s.teacher_id = pc.halaqah_id AND s.id = pc.student_id
    WHERE pc.halaqah_id = ${halaqahId} AND pc.student_id = ${studentId} AND s.deleted_at IS NULL
  `;
  return rows.map((r) => ({
    endpoint: r.endpoint as string,
    p256dh: r.p256dh as string,
    auth: r.auth as string,
    parentId: Number(r.parent_id),
    studentName: r.student_name as string,
  }));
}

export async function markParentPushSubscriptionSuccess(endpoint: string): Promise<void> {
  await db().sql`UPDATE parent_push_subscriptions SET last_success_at = now() WHERE endpoint = ${endpoint}`;
}
