import "server-only";

import { currentStudent, currentTeacher } from "./auth";
import { db } from "./db";
import { currentMosqueAdmin } from "./mosque-auth";
import { isAdmin } from "./mosque/admin-auth";
import { currentParent } from "./parent-auth";
import {
  mapMosqueAdminIdentity,
  mapParentIdentity,
  mapStudentIdentity,
  mapTeacherIdentity,
  parseStudentLegacyId,
  studentLegacyId,
  type IdentityMapping,
  type LegacyKind,
  type MembershipRole,
} from "./identity-mapping";

/*
  M5 — الهوية الموحّدة. جدولا users + memberships (ترحيل
  20261027000000) خريطة «الشخص وأدواره» فقط: التوثيق كله يبقى بمصادره
  القديمة (جداول كلمات المرور والكوكيز لم تُمسّ). هذا الملف:

  1. resolveIdentity: من أي جلسة قائمة (معلّم/طالب/ولي أمر/مدير جامع/
     أدمن) ← {المستخدم، العضوية الحالية، كل عضوياته الفعّالة}.
  2. ensureIdentity: ينشئ user+membership للحسابات الجديدة — يُستدعى داخل
     ترانزاكشن إنشاء الحساب نفسها (لاحظ نوع IdentityClient) بنفس قواعد
     backfill الترحيل حرفياً (identity-mapping.ts هو العقد المشترك).
*/

export type IdentityKind = "teacher" | "student" | "parent" | "mosque_admin" | "developer";

export type UnifiedUser = {
  id: number;
  displayName: string;
  email: string | null;
  username: string | null;
};

export type Membership = {
  id: number;
  userId: number;
  role: MembershipRole;
  mosqueId: number | null;
  halaqahId: number | null;
  studentId: string | null;
  legacyKind: LegacyKind;
  legacyId: string;
  active: boolean;
  /** للتسمية فقط (التبديل/العرض) — من halaqahs/mosques وقت القراءة */
  halaqahName: string | null;
  mosqueName: string | null;
};

export type Identity = {
  kind: IdentityKind | null;
  user: UnifiedUser | null;
  /** العضوية المطابقة للجلسة الحالية — null لو تعذّر إيجادها (ترحيل لم يُطبَّق بعد مثلاً) */
  current: Membership | null;
  memberships: Membership[];
};

/** عميل ترانزاكشن (db().pool.connect()) أو الغلاف نفسه — ensureIdentity يعمل داخل ترانزاكشن المنشئ */
type IdentityClient = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

function rowToMembership(row: Record<string, unknown>): Membership {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    role: row.role as MembershipRole,
    mosqueId: row.mosque_id === null || row.mosque_id === undefined ? null : Number(row.mosque_id),
    halaqahId: row.halaqah_id === null || row.halaqah_id === undefined ? null : Number(row.halaqah_id),
    studentId: (row.student_id as string | null) ?? null,
    legacyKind: row.legacy_kind as LegacyKind,
    legacyId: row.legacy_id as string,
    active: row.active === true,
    halaqahName: (row.halaqah_name as string | null) ?? null,
    mosqueName: (row.mosque_name as string | null) ?? null,
  };
}

// ————— القراءة —————
// قائمة الأعمدة مكتوبة حرفياً في كل استعلام (لا وسيط نصي داخل sql``):
// كل ${} داخل القالب يصير قيمة مقيَّدة لا نص SQL، فتمرير أسماء أعمدة
// كوسائط سيرجع ثابتاً نصياً بدل الأعمدة.

async function getUserById(id: number): Promise<UnifiedUser | null> {
  const rows = await db().sql`
    SELECT id, display_name, email, username FROM users WHERE id = ${id}
  `;
  const row = rows[0];
  return row
    ? {
        id: Number(row.id),
        displayName: row.display_name as string,
        email: (row.email as string | null) ?? null,
        username: (row.username as string | null) ?? null,
      }
    : null;
}

export async function listMembershipsForUser(userId: number): Promise<Membership[]> {
  const rows = await db().sql`
    SELECT m.id, m.user_id, m.role, m.mosque_id, m.halaqah_id, m.student_id,
           m.legacy_kind, m.legacy_id, m.active,
           h.name AS halaqah_name, mo.name AS mosque_name
    FROM memberships m
    LEFT JOIN halaqahs h ON h.id = m.halaqah_id
    LEFT JOIN mosques mo ON mo.id = m.mosque_id
    WHERE m.user_id = ${userId}
    ORDER BY m.created_at, m.id
  `;
  return rows.map(rowToMembership);
}

/**
 * العضوية المشيرة لصف قديم — مفتاح backfill نفسه. role اختياري لأن مفتاح
 * العضوية الفريد يشمل الدور (معلّم واحد قد يغيّر دورة نظرياً مستقبلاً).
 */
export async function findMembershipByLegacy(
  legacyKind: LegacyKind,
  legacyId: string,
  role?: MembershipRole,
): Promise<Membership | null> {
  const rows = await db().sql`
    SELECT m.id, m.user_id, m.role, m.mosque_id, m.halaqah_id, m.student_id,
           m.legacy_kind, m.legacy_id, m.active,
           h.name AS halaqah_name, mo.name AS mosque_name
    FROM memberships m
    LEFT JOIN halaqahs h ON h.id = m.halaqah_id
    LEFT JOIN mosques mo ON mo.id = m.mosque_id
    WHERE m.legacy_kind = ${legacyKind} AND m.legacy_id = ${legacyId}
      AND (${role ?? null}::text IS NULL OR m.role = ${role ?? null})
    LIMIT 1
  `;
  return rows[0] ? rowToMembership(rows[0]) : null;
}

/** عضوية بمعرّفها — لمسار التبديل (الملكية تُفحص عند المستدعي) */
export async function findMembershipById(id: number): Promise<Membership | null> {
  const rows = await db().sql`
    SELECT m.id, m.user_id, m.role, m.mosque_id, m.halaqah_id, m.student_id,
           m.legacy_kind, m.legacy_id, m.active,
           h.name AS halaqah_name, mo.name AS mosque_name
    FROM memberships m
    LEFT JOIN halaqahs h ON h.id = m.halaqah_id
    LEFT JOIN mosques mo ON mo.id = m.mosque_id
    WHERE m.id = ${id}
    LIMIT 1
  `;
  return rows[0] ? rowToMembership(rows[0]) : null;
}

async function identityForLegacy(
  kind: IdentityKind,
  legacyKind: LegacyKind,
  legacyId: string,
  role?: MembershipRole,
): Promise<Identity> {
  const current = await findMembershipByLegacy(legacyKind, legacyId, role);
  if (!current) return { kind, user: null, current: null, memberships: [] };
  const [user, memberships] = await Promise.all([
    getUserById(current.userId),
    listMembershipsForUser(current.userId),
  ]);
  return { kind, user, current, memberships };
}

/**
 * هوية صاحب أي جلسة قائمة الآن، بترتيب ثابت (معلّم ← طالب ← ولي أمر ←
 * مدير جامع ← أدمن). الكوكيز مستقلة فيجوز أن يملك الجهاز أكثر من جلسة —
 * الأولى الفعّالة بهذا الترتيب هي «الدور الحالي». جلسة الأدمن بلا صف users
 * (ADMIN_SECRET ليس حساباً) فتعاد kind=developer بلا مستخدم.
 */
export async function resolveIdentity(): Promise<Identity> {
  const teacher = await currentTeacher();
  if (teacher) return identityForLegacy("teacher", "teacher", String(teacher.id), teacher.role);

  const student = await currentStudent();
  if (student) {
    return identityForLegacy("student", "student", studentLegacyId(student.teacherId, student.id), "student");
  }

  const parent = await currentParent();
  if (parent) return identityForLegacy("parent", "parent", String(parent.id), "parent");

  const mosqueAdmin = await currentMosqueAdmin();
  if (mosqueAdmin) {
    return identityForLegacy("mosque_admin", "mosque_admin", String(mosqueAdmin.id), "mosque_admin");
  }

  if (await isAdmin()) return { kind: "developer", user: null, current: null, memberships: [] };

  return { kind: null, user: null, current: null, memberships: [] };
}

// ————— الإنشاء (داخل ترانزاكشن إنشاء الحساب القديم نفسها) —————

/**
 * يضمن وجود user+membership للحساب الجديد — بنفس منطق backfill الترحيل:
 * عضوية موجودة مسبقاً = لا شيء (idempotent)؛ بريد موجود (معلّم/ولي أمر
 * بالبريد نفسه = شخص واحد) = إعادة استخدام المستخدم؛ غير ذلك ينشئ
 * مستخدماً جديداً. تُستدعى حصراً داخل ترانزاكشن المنشئ فترجع/تُرجَع معه.
 */
export async function ensureIdentity(client: IdentityClient, mapping: IdentityMapping): Promise<void> {
  const { user, membership } = mapping;

  const existing = await client.query(
    `SELECT id FROM memberships
     WHERE legacy_kind = $1 AND legacy_id = $2 AND role = $3
       AND student_id IS NOT DISTINCT FROM $4`,
    [membership.legacyKind, membership.legacyId, membership.role, membership.studentId],
  );
  if ((existing.rowCount ?? 0) > 0) return;

  let userId: number | null = null;
  if (user.email !== null) {
    const found = await client.query(`SELECT id FROM users WHERE email = $1`, [user.email]);
    userId = found.rows[0] ? Number(found.rows[0].id) : null;
  }
  if (userId === null) {
    const inserted = await client.query(
      `INSERT INTO users (display_name, email, username)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [user.displayName, user.email, user.username],
    );
    userId = inserted.rows[0] ? Number(inserted.rows[0].id) : null;
    // سباق نادر: إنشاؤن متزامنان بنفس البريد — الأول كسب، فنعيد استخدام صفه
    if (userId === null && user.email !== null) {
      const found = await client.query(`SELECT id FROM users WHERE email = $1`, [user.email]);
      userId = found.rows[0] ? Number(found.rows[0].id) : null;
    }
  }
  if (userId === null) throw new Error("تعذّر إنشاء هوية المستخدم");

  await client.query(
    `INSERT INTO memberships (user_id, role, mosque_id, halaqah_id, student_id, legacy_kind, legacy_id, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [
      userId,
      membership.role,
      membership.mosqueId,
      membership.halaqahId,
      membership.studentId,
      membership.legacyKind,
      membership.legacyId,
      membership.active,
    ],
  );
}

// ————— أغلفة الإنشاء لكل نوع — تُستدعى من دوال الإنشاء القديمة داخل ترانزاكشنها —————

/** داخل ترانزاكشن إنشاء معلّم (createHalaqahWithSupervisor / joinHalaqahAsAssistant) */
export function ensureTeacherIdentity(client: IdentityClient, row: {
  id: number;
  username: string;
  teacherName: string;
  halaqahId: number;
  role: "supervisor" | "assistant";
}): Promise<void> {
  return ensureIdentity(client, mapTeacherIdentity(row));
}

/** داخل ترانزاكشن إنشاء ولي أمر (createParent) */
export function ensureParentIdentity(client: IdentityClient, row: {
  id: number;
  email: string;
  name: string;
}): Promise<void> {
  return ensureIdentity(client, mapParentIdentity(row));
}

/** داخل ترانزاكشن منح طالب بيانات دخول أو إنشاء حساب جوجل له */
export function ensureStudentIdentity(client: IdentityClient, row: {
  halaqahId: number;
  id: string;
  name: string;
  username: string | null;
  active: boolean;
}): Promise<void> {
  return ensureIdentity(client, mapStudentIdentity(row));
}

/** داخل ترانزاكشن إنشاء/استبدال حساب مدير جامع (upsertMosqueAdmin) */
export function ensureMosqueAdminIdentity(client: IdentityClient, row: {
  id: number;
  mosqueId: number;
  username: string;
}): Promise<void> {
  return ensureIdentity(client, mapMosqueAdminIdentity(row));
}

/**
 * استبدال حساب مدير جامع غيّر الشخص (اسم مستخدم جديد): يحدّث مقبض المستخدم
 * المرتبط ببقاء العضوية نفسها — داخل ترانزاكشن upsertMosqueAdmin.
 */
export async function syncMosqueAdminUserHandle(client: IdentityClient, adminId: number, username: string): Promise<void> {
  await client.query(
    `UPDATE users SET display_name = $1, username = $1
     WHERE id IN (
       SELECT user_id FROM memberships
       WHERE legacy_kind = 'mosque_admin' AND legacy_id = $2 AND role = 'mosque_admin'
     )`,
    [username, String(adminId)],
  );
}

/** عضوية الطالب من legacy_id المركّب "halaqahId:studentId" — تفكيك آمن */
export function studentLegacyKey(legacyId: string): { halaqahId: number; studentId: string } | null {
  return parseStudentLegacyId(legacyId);
}

// ————— وصف العضوية للواجهة (مبدّل الأدوار) —————

/** القشرة التي يقودها الدور + وجهة الهبوط بعد التبديل + التسمية العربية */
export function membershipShell(membership: Membership): {
  kind: IdentityKind;
  home: string;
  label: string;
} {
  switch (membership.role) {
    case "supervisor":
    case "assistant":
      return {
        kind: "teacher",
        home: "/",
        label: `${membership.role === "assistant" ? "مساعد مشرف" : "مشرف"}${
          membership.halaqahName ? ` — ${membership.halaqahName}` : ""
        }`,
      };
    case "parent":
      return { kind: "parent", home: "/parent", label: "ولي أمر" };
    case "student":
      return {
        kind: "student",
        home: "/student",
        label: `طالب${membership.halaqahName ? ` — ${membership.halaqahName}` : ""}`,
      };
    case "mosque_admin":
      return {
        kind: "mosque_admin",
        home: membership.mosqueId ? `/mosque/${membership.mosqueId}` : "/mosque",
        label: `مدير جامع${membership.mosqueName ? ` — ${membership.mosqueName}` : ""}`,
      };
    case "developer":
      return { kind: "developer", home: "/dev", label: "مطوّر" };
  }
}

/** رابط دخول الدور معبَّأً ببيانات المستخدم الموحّد حيث تدعمه صفحات الدخول القائمة */
export function loginHrefFor(kind: string, user: { email: string | null; username: string | null }): string {
  switch (kind) {
    case "teacher":
      return `/login?identifier=${encodeURIComponent(user.email ?? "")}`;
    case "parent":
      return `/parent/login?email=${encodeURIComponent(user.email ?? "")}`;
    case "mosque_admin":
      return `/mosque-login?username=${encodeURIComponent(user.username ?? "")}`;
    default:
      return "/student";
  }
}
