import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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

/** بصمة كلمة مرور ولي الأمر الحالية — للتحقق من «الحالية» عند تغييرها من الإعدادات فقط */
export async function parentPasswordHash(id: number): Promise<string | null> {
  const rows = await db().sql`SELECT password_hash FROM parents WHERE id = ${id}`;
  return (rows[0]?.password_hash as string | undefined) ?? null;
}

/** كلمة مرور جديدة + رفع نسخة الجلسة (تسقط جلسات الأجهزة الأخرى) */
export async function updateParentPassword(id: number, passwordHash: string): Promise<void> {
  await db().sql`UPDATE parents SET password_hash = ${passwordHash}, session_version = session_version + 1
    WHERE id = ${id}`;
}

/** اسم ولي الأمر (للعرض) — المعرّف من جلسته حصراً */
export async function updateParentName(id: number, name: string): Promise<void> {
  await db().sql`UPDATE parents SET name = ${name} WHERE id = ${id}`;
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

/** كل أجهزة ولي أمر بعينه — للإشعار برسالة داخلية جديدة (المراسلة B2) */
export async function listParentPushTargets(parentId: number): Promise<PushSubscriptionData[]> {
  const rows = await db().sql`
    SELECT endpoint, p256dh, auth FROM parent_push_subscriptions WHERE parent_id = ${parentId}
  `;
  return rows.map((r) => ({ endpoint: r.endpoint as string, p256dh: r.p256dh as string, auth: r.auth as string }));
}

// ————— واتساب ولي الأمر (B1) —————

export type ParentWhatsappInfo = {
  phone: string | null;
  optedIn: boolean;
  optedInAt: string | null;
  /** رمز تأكيد صالح بانتظار الإدخال (لم ينتهِ ولم تُستنفد محاولاته) */
  pendingConfirmation: boolean;
};

export async function getParentWhatsappInfo(parentId: number): Promise<ParentWhatsappInfo> {
  const rows = await db().sql`
    SELECT phone, whatsapp_opt_in, whatsapp_opt_in_at,
           (whatsapp_code_hash IS NOT NULL AND whatsapp_code_expires_at > now()
            AND whatsapp_code_attempts < 5) AS pending
    FROM parents WHERE id = ${parentId}
  `;
  const row = rows[0];
  return {
    phone: (row?.phone as string | null) ?? null,
    optedIn: row?.whatsapp_opt_in === true,
    optedInAt: row?.whatsapp_opt_in_at ? new Date(row.whatsapp_opt_in_at as string).toISOString() : null,
    pendingConfirmation: row?.pending === true,
  };
}

/**
 * حفظ رقم الجوال (E.164 — طُبِّع عند المستدعي) مع رمز تأكيد مجزّأ. تغيير
 * الرقم يُسقط الموافقة ويصفّر محاولات الرمز: الموافقة مقترنة برقم بعينه
 * وتُفعَّل بإدخال الرمز فقط. سقف التغيير 3 باليوم (يوم الرياض) يُنفَّذ
 * بالشرط نفسه؛ false = تجاوز السقف ولم يُحفظ شيء.
 */
export async function setParentWhatsappPhone(
  parentId: number,
  phone: string,
  codeHash: string,
  maxChangesPerDay: number,
  codeTtlMinutes: number,
): Promise<boolean> {
  const rows = await db().sql`
    UPDATE parents
    SET phone = ${phone}, whatsapp_opt_in = FALSE, whatsapp_opt_in_at = NULL,
        whatsapp_code_hash = ${codeHash},
        whatsapp_code_expires_at = now() + make_interval(mins => ${codeTtlMinutes}::int),
        whatsapp_code_attempts = 0,
        whatsapp_phone_changes = CASE
          WHEN whatsapp_phone_changes_day = (now() AT TIME ZONE 'Asia/Riyadh')::date THEN whatsapp_phone_changes + 1
          ELSE 1
        END,
        whatsapp_phone_changes_day = (now() AT TIME ZONE 'Asia/Riyadh')::date
    WHERE id = ${parentId}
      AND (whatsapp_phone_changes_day IS DISTINCT FROM (now() AT TIME ZONE 'Asia/Riyadh')::date
           OR whatsapp_phone_changes < ${maxChangesPerDay}::int)
    RETURNING id
  `;
  return rows.length > 0;
}

export type ParentCodeOutcome = "ok" | "invalid" | "expired" | "locked" | "none";

/**
 * التحقق من رمز التأكيد وتفعيل الموافقة عند صحته. كل محاولة تُعدّ ذرّياً
 * قبل المقارنة (حد أقصى لعدد المحاولات)، والرمز المنتهي أو المستنفد لا
 * يُقبل ولو صحّ. نجاحه يمسح الرمز فلا يُعاد استعماله.
 */
export async function confirmParentWhatsappCode(
  parentId: number,
  code: string,
  hashFor: (phone: string, code: string) => string,
  maxAttempts: number,
): Promise<ParentCodeOutcome> {
  const claimed = await db().sql`
    UPDATE parents SET whatsapp_code_attempts = whatsapp_code_attempts + 1
    WHERE id = ${parentId} AND whatsapp_code_hash IS NOT NULL AND phone IS NOT NULL
      AND whatsapp_code_expires_at > now() AND whatsapp_code_attempts < ${maxAttempts}::int
    RETURNING phone, whatsapp_code_hash
  `;
  const row = claimed[0];
  if (!row) {
    const state = await db().sql`
      SELECT whatsapp_code_hash, whatsapp_code_expires_at, whatsapp_code_attempts FROM parents WHERE id = ${parentId}
    `;
    const current = state[0];
    if (!current || !current.whatsapp_code_hash) return "none";
    if (Number(current.whatsapp_code_attempts) >= maxAttempts) return "locked";
    return "expired";
  }
  const expected = row.whatsapp_code_hash as string;
  const given = hashFor(row.phone as string, code);
  if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return "invalid";
  }
  await db().sql`
    UPDATE parents
    SET whatsapp_opt_in = TRUE, whatsapp_opt_in_at = now(),
        whatsapp_code_hash = NULL, whatsapp_code_expires_at = NULL, whatsapp_code_attempts = 0
    WHERE id = ${parentId}
  `;
  return "ok";
}

/** هل رقم بعينه ما زال لولي موافق؟ (إعادة التحقق قبل إعادة الإرسال اليدوي) */
export async function isPhoneWhatsappOptedIn(phone: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT 1 FROM parents WHERE phone = ${phone} AND whatsapp_opt_in = TRUE LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * إيقاف الموافقة من اللوحة. التفعيل لا يمرّ من هنا أبداً — يلزمه رمز تأكيد
 * الرقم (confirmParentWhatsappCode)؛ true إن تغيّر شيء.
 */
export async function disableParentWhatsappOptIn(parentId: number): Promise<boolean> {
  const rows = await db().sql`
    UPDATE parents SET whatsapp_opt_in = FALSE, whatsapp_opt_in_at = NULL
    WHERE id = ${parentId}
    RETURNING id
  `;
  return rows.length > 0;
}

/** إيقاف الموافقة من الويبهوك (كلمة «إيقاف») — يرجع عدد الصفوف المُحدَّثة */
export async function optOutParentByPhone(phone: string): Promise<number> {
  const rows = await db().sql`
    UPDATE parents SET whatsapp_opt_in = FALSE, whatsapp_opt_in_at = NULL
    WHERE phone = ${phone} AND whatsapp_opt_in
    RETURNING id
  `;
  return rows.length;
}

export type WhatsappParentTarget = { parentId: number; phone: string; studentName: string };

/**
 * أولياء طالب بعينه المؤهلون لواتساب: المتفقون فقط (whatsapp_opt_in) ممن
 * لهم رقم محفوظ — لا موافقة لا رسالة، هذا الاستعلام هو مكان الإنفاذ كله.
 */
export async function listWhatsappParentsForStudent(
  halaqahId: number,
  studentId: string,
): Promise<WhatsappParentTarget[]> {
  const rows = await db().sql`
    SELECT pc.parent_id, p.phone, s.name AS student_name
    FROM parent_children pc
    JOIN parents p ON p.id = pc.parent_id
    JOIN students s ON s.teacher_id = pc.halaqah_id AND s.id = pc.student_id
    WHERE pc.halaqah_id = ${halaqahId} AND pc.student_id = ${studentId} AND s.deleted_at IS NULL
      AND p.whatsapp_opt_in = TRUE AND p.phone IS NOT NULL AND p.phone != ''
  `;
  return rows.map((r) => ({
    parentId: Number(r.parent_id),
    phone: r.phone as string,
    studentName: r.student_name as string,
  }));
}
