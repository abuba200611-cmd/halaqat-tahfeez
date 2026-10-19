import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { ensureMosqueAdminIdentity, syncMosqueAdminUserHandle } from "@/lib/identity";
import { FEATURES, type Feature } from "./features";
import { MAX_PHOTOS_PER_MOSQUE, type TagKind } from "./archive";

/*
  نظام إدارة الجامع — طبقة الوصول لبياناته فوق قاعدة الحلقات الموحّدة
  (كل شيء عبر موصّل @/lib/db نفسه). الفروق عن نسخة masjid-idara المستقلة:
  - mosque_registrations بدل pending_students (نفس الأعمدة + student_id
    يربط التسجيل الموزَّع بالطالب الحقيقي الذي أُنشئ بحلقاته).
  - الحلقات هي halaqahs الحقيقية نفسها، وارتباطها بالجامع عمود
    halaqahs.mosque_id (لا جدول روابط ولا مطابقة رموز هنا).
  - جلسة مدير الجامع من lib/mosque-auth.ts (جذر المشروع) كما هي.
*/

// ————— الجوامع —————

export type Mosque = { id: number; name: string; city: string; createdAt: string };

export async function listMosques(): Promise<Mosque[]> {
  const rows = await db().sql`SELECT id, name, city, created_at FROM mosques ORDER BY name`;
  return rows.map((r) => ({ id: r.id as number, name: r.name as string, city: r.city as string, createdAt: r.created_at as string }));
}

export async function getMosque(id: number): Promise<Mosque | null> {
  const rows = await db().sql`SELECT id, name, city, created_at FROM mosques WHERE id = ${id}`;
  const row = rows[0];
  return row ? { id: row.id, name: row.name, city: row.city, createdAt: row.created_at } : null;
}

export async function createMosque(name: string, city: string): Promise<number> {
  const rows = await db().sql`INSERT INTO mosques (name, city) VALUES (${name}, ${city}) RETURNING id`;
  return Number(rows[0].id);
}

// ————— حلقات الجامع (halaqahs الحقيقية المربوطة بـ mosque_id) —————

export type Halaqah = {
  id: number;
  /** null = حلقة معلّم لم تنضم لأي جامع بعد */
  mosqueId: number | null;
  halaqahName: string;
  teacherName: string;
  createdAt: string;
};

function rowToHalaqah(row: Record<string, unknown>): Halaqah {
  return {
    id: row.id as number,
    mosqueId: (row.mosque_id as number | null) ?? null,
    halaqahName: row.halaqah_name as string,
    teacherName: (row.teacher_names as string | null) ?? "",
    createdAt: (row.created_at as string) ?? "",
  };
}

// أسماء معلّمي الحلقة مجتمعة (المشرف أولاً) — نفس تجميع findHalaqahByInviteCode
export async function listHalaqahs(mosqueId: number): Promise<Halaqah[]> {
  const rows = await db().sql`
    SELECT h.id, h.mosque_id, h.name AS halaqah_name, h.created_at,
           COALESCE((
             SELECT string_agg(t.teacher_name, '، ' ORDER BY (t.role = 'supervisor') DESC)
             FROM teachers t WHERE t.halaqah_id = h.id AND t.teacher_name != ''
           ), '') AS teacher_names
    FROM halaqahs h
    WHERE h.mosque_id = ${mosqueId}
    ORDER BY h.name
  `;
  return rows.map(rowToHalaqah);
}

export async function getHalaqah(id: number): Promise<Halaqah | null> {
  const rows = await db().sql`
    SELECT h.id, h.mosque_id, h.name AS halaqah_name, h.created_at,
           COALESCE((
             SELECT string_agg(t.teacher_name, '، ' ORDER BY (t.role = 'supervisor') DESC)
             FROM teachers t WHERE t.halaqah_id = h.id AND t.teacher_name != ''
           ), '') AS teacher_names
    FROM halaqahs h
    WHERE h.id = ${id}
  `;
  const row = rows[0];
  return row ? rowToHalaqah(row) : null;
}

export type LinkHalaqahResult =
  | { ok: true; alreadyLinked: boolean; halaqah: Halaqah }
  | { ok: false; reason: "invalid" | "conflict" };

/**
 * يربط حلقة بجامع بتحديث halaqahs.mosque_id مباشرة (لا جدول روابط). الشرط
 * `mosque_id IS NULL` ذرّي: يتغلّب على سباق ربطين متزامنين ويمنع نقل حلقة
 * مربوطة أصلاً بجامع آخر. النتيجة: linked | already (نفس الجامع) | conflict.
 */
export async function attachHalaqahToMosque(
  mosqueId: number,
  halaqahId: number,
): Promise<"linked" | "already" | "conflict" | "missing"> {
  const updated = await db().sql`
    UPDATE halaqahs SET mosque_id = ${mosqueId} WHERE id = ${halaqahId} AND mosque_id IS NULL RETURNING id
  `;
  if (updated.length > 0) return "linked";
  const rows = await db().sql`SELECT mosque_id FROM halaqahs WHERE id = ${halaqahId}`;
  if (!rows[0]) return "missing";
  return rows[0].mosque_id === mosqueId ? "already" : "conflict";
}

/**
 * يربط حلقة حقيقية بجامع عبر رمز دعوة طلابها (إضافة يدوية من المدير) —
 * لا صف يُنشأ، فقط halaqahs.mosque_id. idempotent لنفس الجامع، ورفض لحلقة
 * مربوطة أصلاً بجامع آخر.
 */
export async function linkHalaqahByInviteCode(mosqueId: number, inviteCode: string): Promise<LinkHalaqahResult> {
  const rows = await db().sql`
    SELECT h.id, h.mosque_id, h.name AS halaqah_name, h.created_at,
           COALESCE((
             SELECT string_agg(t.teacher_name, '، ' ORDER BY (t.role = 'supervisor') DESC)
             FROM teachers t WHERE t.halaqah_id = h.id AND t.teacher_name != ''
           ), '') AS teacher_names
    FROM halaqahs h
    WHERE h.invite_code = ${inviteCode}
  `;
  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  const halaqah = rowToHalaqah(row);

  const outcome = await attachHalaqahToMosque(mosqueId, halaqah.id);
  if (outcome === "conflict" || outcome === "missing") return { ok: false, reason: "conflict" };
  return {
    ok: true,
    alreadyLinked: outcome === "already",
    halaqah: { ...halaqah, mosqueId },
  };
}

export type JoinMosqueResult =
  | { ok: true; alreadyJoined: boolean; mosqueName: string }
  | { ok: false; reason: "invalid" | "disabled" | "conflict" };

/**
 * انضمام ذاتي داخل التطبيق: مشرف حلقة فتح رابط /join-mosque?code= فتُربط
 * حلقته بجامع الرمز مباشرة (halaqahs.mosque_id) — بلا رمز دعوة طلاب ولا
 * نداء بين خادمين. الميزة "halaqat" يجب أن تكون مفعّلة للجامع.
 */
export async function joinHalaqahToMosqueByCode(halaqahId: number, code: string): Promise<JoinMosqueResult> {
  const mosque = await findMosqueByTeacherJoinCode(code);
  if (!mosque) return { ok: false, reason: "invalid" };
  if (!(await isFeatureEnabled(mosque.id, "halaqat"))) return { ok: false, reason: "disabled" };

  const outcome = await attachHalaqahToMosque(mosque.id, halaqahId);
  if (outcome === "conflict" || outcome === "missing") return { ok: false, reason: "conflict" };
  return { ok: true, alreadyJoined: outcome === "already", mosqueName: mosque.name };
}

/** الجامع الذي تنتمي إليه الحلقة حالياً (halaqahs.mosque_id)، أو null — لقسم «الانضمام لجامع» بالإعدادات */
export async function findHalaqahMosque(halaqahId: number): Promise<{ id: number; name: string; city: string } | null> {
  const rows = await db().sql`
    SELECT m.id, m.name, m.city FROM halaqahs h JOIN mosques m ON m.id = h.mosque_id WHERE h.id = ${halaqahId}
  `;
  const row = rows[0];
  return row ? { id: row.id as number, name: row.name as string, city: (row.city as string) ?? "" } : null;
}

// ————— رابط انضمام المعلّمين (رمز واحد لكل جامع) —————

function newJoinCode(): string {
  return randomBytes(7).toString("base64url"); // ١٠ محارف آمنة للروابط
}

/** رمز انضمام المعلّمين — يُولَّد كسولاً عند أول طلب ويبقى ثابتاً حتى يُجدَّد */
export async function getOrCreateTeacherJoinCode(mosqueId: number): Promise<string | null> {
  const existing = await db().sql`SELECT teacher_join_code FROM mosques WHERE id = ${mosqueId}`;
  if (!existing[0]) return null;
  const current = existing[0].teacher_join_code as string | null | undefined;
  if (current) return current;

  await db().sql`
    UPDATE mosques SET teacher_join_code = ${newJoinCode()} WHERE id = ${mosqueId} AND teacher_join_code IS NULL
  `;
  const after = await db().sql`SELECT teacher_join_code FROM mosques WHERE id = ${mosqueId}`;
  return (after[0]?.teacher_join_code as string | null) ?? null;
}

/** يستبدل الرمز بجديد — القديم يتوقف عن العمل فوراً */
export async function rotateTeacherJoinCode(mosqueId: number): Promise<string | null> {
  const code = newJoinCode();
  const rows = await db().sql`UPDATE mosques SET teacher_join_code = ${code} WHERE id = ${mosqueId} RETURNING id`;
  return rows[0] ? code : null;
}

export async function findMosqueByTeacherJoinCode(code: string): Promise<Mosque | null> {
  const rows = await db().sql`
    SELECT id, name, city, created_at FROM mosques WHERE teacher_join_code = ${code}
  `;
  const row = rows[0];
  return row ? { id: row.id, name: row.name, city: row.city, createdAt: row.created_at } : null;
}

// ————— تسجيلات الجامع (كانت pending_students) —————

export type MosqueRegistration = {
  id: number;
  mosqueId: number;
  name: string;
  phone: string;
  status: "pending" | "assigned";
  halaqahId: number | null;
  /** الطالب الحقيقي الذي أُنشئ عند التوزيع (students.id بنفس حلقة التوزيع)، أو null قبل التوزيع أو لسجل منقول قديم */
  studentId: string | null;
  createdAt: string;
  assignedAt: string | null;
};

function rowToRegistration(row: Record<string, unknown>): MosqueRegistration {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    name: row.name as string,
    phone: row.phone as string,
    status: row.status as "pending" | "assigned",
    halaqahId: (row.halaqah_id as number | null) ?? null,
    studentId: (row.student_id as string | null) ?? null,
    createdAt: row.created_at as string,
    assignedAt: (row.assigned_at as string | null) ?? null,
  };
}

/** تسجيل عام عبر رابط الجامع — بلا اختيار حلقة، الجامع يوزّعه لاحقاً */
export async function addMosqueRegistration(mosqueId: number, name: string, phone: string): Promise<number> {
  const rows = await db().sql`
    INSERT INTO mosque_registrations (mosque_id, name, phone) VALUES (${mosqueId}, ${name}, ${phone}) RETURNING id
  `;
  return Number(rows[0].id);
}

export async function listMosqueRegistrations(mosqueId: number): Promise<MosqueRegistration[]> {
  const rows = await db().sql`
    SELECT id, mosque_id, name, phone, status, halaqah_id, student_id, created_at, assigned_at
    FROM mosque_registrations WHERE mosque_id = ${mosqueId} ORDER BY created_at DESC
  `;
  return rows.map(rowToRegistration);
}

export async function getMosqueRegistration(id: number): Promise<MosqueRegistration | null> {
  const rows = await db().sql`
    SELECT id, mosque_id, name, phone, status, halaqah_id, student_id, created_at, assigned_at
    FROM mosque_registrations WHERE id = ${id}
  `;
  const row = rows[0];
  return row ? rowToRegistration(row) : null;
}

/**
 * يحجز التسجيل للتوزيع ذرّياً (pending → assigned) — الشرط status='pending'
 * يمنع توزيعه مرتين عند ضغطين متزامنين. false = وُزِّع أصلاً (أو لا وجود له).
 */
export async function claimRegistration(id: number, halaqahId: number): Promise<boolean> {
  const rows = await db().sql`
    UPDATE mosque_registrations
    SET status = 'assigned', halaqah_id = ${halaqahId}, assigned_at = now()
    WHERE id = ${id} AND status = 'pending'
    RETURNING id
  `;
  return rows.length > 0;
}

/** يربط التسجيل الموزَّع بالطالب الحقيقي الذي أُنشئ بالحلقة */
export async function setRegistrationStudent(id: number, studentId: string): Promise<void> {
  await db().sql`UPDATE mosque_registrations SET student_id = ${studentId} WHERE id = ${id}`;
}

/** يتراجع عن الحجز (فشل إنشاء الطالب بالحلقة) فيعود التسجيل بانتظار التوزيع */
export async function releaseRegistration(id: number): Promise<void> {
  await db().sql`
    UPDATE mosque_registrations
    SET status = 'pending', halaqah_id = NULL, student_id = NULL, assigned_at = NULL
    WHERE id = ${id}
  `;
}

// ————— مدراء الجوامع (كل جامع له مدير خاص، غير المشرف العام) —————

export type MosqueAdmin = { id: number; mosqueId: number; username: string };

/** ينشئ حساب مدير للجامع، أو يستبدل حساب هذا الجامع الحالي لو موجود أصلاً
 * (جامع = مدير واحد). هوية M5 (user+membership) تنشآن بترانزاكشن الحساب
 * نفسها؛ الاستبدال يحدّث مقبض المستخدم المرتبط (شخص جديد غالباً). */
export async function upsertMosqueAdmin(mosqueId: number, username: string, passwordHash: string): Promise<void> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query(
      `INSERT INTO mosque_admins (mosque_id, username, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (mosque_id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash
       RETURNING id, username`,
      [mosqueId, username, passwordHash],
    );
    const adminId = Number(rows.rows[0].id);
    const finalUsername = rows.rows[0].username as string;
    await ensureMosqueAdminIdentity(client, { id: adminId, mosqueId, username: finalUsername });
    await syncMosqueAdminUserHandle(client, adminId, finalUsername);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findMosqueAdminByUsername(
  username: string,
): Promise<{ id: number; mosqueId: number; username: string; passwordHash: string } | null> {
  const rows = await db().sql`SELECT * FROM mosque_admins WHERE username = ${username}`;
  const row = rows[0];
  return row
    ? { id: row.id, mosqueId: row.mosque_id, username: row.username, passwordHash: row.password_hash }
    : null;
}

/** بصمة كلمة مرور مدير الجامع الحالية — للتحقق من «الحالية» عند تغييرها من الإعدادات فقط */
export async function mosqueAdminPasswordHash(adminId: number): Promise<string | null> {
  const rows = await db().sql`SELECT password_hash FROM mosque_admins WHERE id = ${adminId}`;
  return (rows[0]?.password_hash as string | undefined) ?? null;
}

/** كلمة مرور جديدة لمدير الجامع (لا نسخة جلسة لهذا الدور، فلا إبطال للجلسات الأخرى) */
export async function updateMosqueAdminPassword(adminId: number, passwordHash: string): Promise<void> {
  await db().sql`UPDATE mosque_admins SET password_hash = ${passwordHash} WHERE id = ${adminId}`;
}

/** حساب المدير الحالي لهذا الجامع، إن وُجد — لعرضه بلوحة المشرف العام */
export async function getMosqueAdminForMosque(mosqueId: number): Promise<MosqueAdmin | null> {
  const rows = await db().sql`SELECT id, mosque_id, username FROM mosque_admins WHERE mosque_id = ${mosqueId}`;
  const row = rows[0];
  return row ? { id: row.id as number, mosqueId: row.mosque_id as number, username: row.username as string } : null;
}

// ————— مزايا كل جامع (السجل في features.ts، والصفوف هنا تجاوزات فقط) —————

export type MosqueFeature = Feature & { enabled: boolean };

/** كل المزايا كما هي فعلياً لهذا الجامع: صف الجدول إن وُجد، وإلا افتراض السجل */
export async function getMosqueFeatures(mosqueId: number): Promise<MosqueFeature[]> {
  const rows = await db().sql`SELECT feature_key, enabled FROM mosque_features WHERE mosque_id = ${mosqueId}`;
  const overrides = new Map(rows.map((row) => [row.feature_key as string, row.enabled as boolean]));
  return FEATURES.map((feature) => ({ ...feature, enabled: overrides.get(feature.key) ?? feature.defaultEnabled }));
}

/** مفعّلة؟ ميزة غير معروفة أو "قريباً" لا تكون مفعّلة أبداً */
export async function isFeatureEnabled(mosqueId: number, key: string): Promise<boolean> {
  const feature = FEATURES.find((f) => f.key === key);
  if (!feature || feature.status !== "ready") return false;

  const rows = await db().sql`
    SELECT enabled FROM mosque_features WHERE mosque_id = ${mosqueId} AND feature_key = ${key}
  `;
  return rows[0] ? rows[0].enabled === true : feature.defaultEnabled;
}

export async function setMosqueFeature(mosqueId: number, key: string, enabled: boolean): Promise<void> {
  await db().sql`
    INSERT INTO mosque_features (mosque_id, feature_key, enabled)
    VALUES (${mosqueId}, ${key}, ${enabled})
    ON CONFLICT (mosque_id, feature_key) DO UPDATE SET enabled = excluded.enabled, updated_at = now()
  `;
}

// ————— الدماغ: ملاحظات قديمة تُقرأ فقط وتظهر كعُقَد بالخريطة (الكتابة عبر سكربت الاستيراد) —————

export type BrainNote = {
  id: number;
  mosqueId: number;
  slug: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

function rowToBrainNote(row: Record<string, unknown>): BrainNote {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    slug: row.slug as string,
    title: row.title as string,
    body: row.body as string,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listBrainNotes(mosqueId: number): Promise<BrainNote[]> {
  const rows = await db().sql`
    SELECT id, mosque_id, slug, title, body, tags, created_at, updated_at
    FROM brain_notes WHERE mosque_id = ${mosqueId} ORDER BY updated_at DESC
  `;
  return rows.map(rowToBrainNote);
}

// ————— أعضاء بالاسم الحر (يكملون الطلاب في الأسر واللجان) —————

/** "طالب" يشير إلى mosque_registrations، و"عضو" إلى mosque_members */
export type MemberKind = "student" | "member";
/** هدف التقييم: أسرة أو طالب */
export type TargetKind = "family" | "student";

export type MosqueMember = {
  id: number;
  mosqueId: number;
  name: string;
  phone: string;
  roleNote: string;
  createdAt: string;
};

function rowToMosqueMember(row: Record<string, unknown>): MosqueMember {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    name: row.name as string,
    phone: row.phone as string,
    roleNote: row.role_note as string,
    createdAt: row.created_at as string,
  };
}

export async function listMosqueMembers(mosqueId: number): Promise<MosqueMember[]> {
  const rows = await db().sql`
    SELECT id, mosque_id, name, phone, role_note, created_at
    FROM mosque_members WHERE mosque_id = ${mosqueId} ORDER BY name
  `;
  return rows.map(rowToMosqueMember);
}

export async function createMosqueMember(
  mosqueId: number,
  member: { name: string; phone: string; roleNote: string },
): Promise<MosqueMember> {
  const rows = await db().sql`
    INSERT INTO mosque_members (mosque_id, name, phone, role_note)
    VALUES (${mosqueId}, ${member.name}, ${member.phone}, ${member.roleNote})
    RETURNING id, mosque_id, name, phone, role_note, created_at
  `;
  return rowToMosqueMember(rows[0]);
}

export async function deleteMosqueMember(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM mosque_members WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id
  `;
  if (rows.length === 0) return false;
  // لا أيتام: روابط العضو بالأسر واللجان (الدرجات لا تخص الأعضاء الأحرار: الهدف أسرة أو طالب)
  await db().sql`
    DELETE FROM family_members
    WHERE member_kind = 'member' AND member_id = ${id}
      AND family_id IN (SELECT id FROM families WHERE mosque_id = ${mosqueId})
  `;
  await db().sql`
    DELETE FROM committee_members
    WHERE member_kind = 'member' AND member_id = ${id}
      AND committee_id IN (SELECT id FROM committees WHERE mosque_id = ${mosqueId})
  `;
  return true;
}

/** اسم عضو من أفراد هذا الجامع (تسجيل طالب أو حر)، أو null — تحقق قبل الإضافة لأسرة/لجنة */
export async function findMemberName(
  mosqueId: number,
  kind: MemberKind,
  memberId: number,
): Promise<string | null> {
  const rows =
    kind === "student"
      ? await db().sql`SELECT name FROM mosque_registrations WHERE mosque_id = ${mosqueId} AND id = ${memberId}`
      : await db().sql`SELECT name FROM mosque_members WHERE mosque_id = ${mosqueId} AND id = ${memberId}`;
  return rows[0] ? (rows[0].name as string) : null;
}

// ————— الأسر —————

export type Family = {
  id: number;
  mosqueId: number;
  name: string;
  leaderName: string;
  notes: string;
  createdAt: string;
  memberCount: number;
};

function rowToFamily(row: Record<string, unknown>): Family {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    name: row.name as string,
    leaderName: row.leader_name as string,
    notes: row.notes as string,
    createdAt: row.created_at as string,
    memberCount: (row.member_count as number) ?? 0,
  };
}

export async function listFamilies(mosqueId: number): Promise<Family[]> {
  const rows = await db().sql`
    SELECT f.id, f.mosque_id, f.name, f.leader_name, f.notes, f.created_at,
           (SELECT count(*)::int FROM family_members fm WHERE fm.family_id = f.id) AS member_count
    FROM families f
    WHERE f.mosque_id = ${mosqueId}
    ORDER BY f.name
  `;
  return rows.map(rowToFamily);
}

export async function getFamily(mosqueId: number, id: number): Promise<Family | null> {
  const rows = await db().sql`
    SELECT f.id, f.mosque_id, f.name, f.leader_name, f.notes, f.created_at,
           (SELECT count(*)::int FROM family_members fm WHERE fm.family_id = f.id) AS member_count
    FROM families f
    WHERE f.mosque_id = ${mosqueId} AND f.id = ${id}
  `;
  const row = rows[0];
  return row ? rowToFamily(row) : null;
}

export async function createFamily(
  mosqueId: number,
  family: { name: string; leaderName: string; notes: string },
): Promise<Family> {
  const rows = await db().sql`
    INSERT INTO families (mosque_id, name, leader_name, notes)
    VALUES (${mosqueId}, ${family.name}, ${family.leaderName}, ${family.notes})
    RETURNING id, mosque_id, name, leader_name, notes, created_at
  `;
  return rowToFamily(rows[0]);
}

export async function deleteFamily(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM families WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id
  `;
  if (rows.length === 0) return false;
  // درجات الأسرة المحذوفة لا معنى لها (الهدف بلا مفتاح أجنبي)
  await db().sql`
    DELETE FROM evaluations
    WHERE mosque_id = ${mosqueId} AND target_kind = 'family' AND target_id = ${id}
  `;
  return true;
}

export type FamilyMember = {
  id: number;
  memberKind: MemberKind;
  memberId: number;
  name: string;
  createdAt: string;
};

/** أفراد أسرة بأسمائهم — الطالب من mosque_registrations والحرّ من mosque_members */
export async function listFamilyMembers(mosqueId: number, familyId: number): Promise<FamilyMember[]> {
  const rows = await db().sql`
    SELECT fm.id, fm.member_kind, fm.member_id, fm.created_at,
           COALESCE(mr.name, mm.name) AS name
    FROM family_members fm
    JOIN families f ON f.id = fm.family_id AND f.mosque_id = ${mosqueId}
    LEFT JOIN mosque_registrations mr ON fm.member_kind = 'student' AND mr.id = fm.member_id AND mr.mosque_id = ${mosqueId}
    LEFT JOIN mosque_members mm ON fm.member_kind = 'member' AND mm.id = fm.member_id AND mm.mosque_id = ${mosqueId}
    WHERE fm.family_id = ${familyId} AND COALESCE(mr.name, mm.name) IS NOT NULL
    ORDER BY name
  `;
  return rows.map((row) => ({
    id: row.id as number,
    memberKind: row.member_kind as MemberKind,
    memberId: row.member_id as number,
    name: row.name as string,
    createdAt: row.created_at as string,
  }));
}

/** إضافة فرد — false إن كان مضافاً أصلاً (الأسرة نفسها تُتحقق قبلها) */
export async function addFamilyMember(
  mosqueId: number,
  familyId: number,
  kind: MemberKind,
  memberId: number,
): Promise<boolean> {
  const rows = await db().sql`
    INSERT INTO family_members (family_id, member_kind, member_id)
    SELECT ${familyId}::int, ${kind}::text, ${memberId}::int
    WHERE EXISTS (SELECT 1 FROM families WHERE id = ${familyId} AND mosque_id = ${mosqueId})
    ON CONFLICT (family_id, member_kind, member_id) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

export async function removeFamilyMember(
  mosqueId: number,
  familyId: number,
  kind: MemberKind,
  memberId: number,
): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM family_members
    WHERE family_id = ${familyId} AND member_kind = ${kind} AND member_id = ${memberId}
      AND family_id IN (SELECT id FROM families WHERE mosque_id = ${mosqueId})
    RETURNING id
  `;
  return rows.length > 0;
}

/** كل روابط أفراد الأسر بأسمائهم لجامع كامل — يغذّي رسم الدماغ ولوحة الشرف بلا استعلام لكل أسرة */
export async function listFamilyMemberLinks(
  mosqueId: number,
): Promise<{ familyId: number; memberKind: MemberKind; memberId: number; name: string }[]> {
  const rows = await db().sql`
    SELECT fm.family_id, fm.member_kind, fm.member_id, COALESCE(mr.name, mm.name) AS name
    FROM family_members fm
    JOIN families f ON f.id = fm.family_id AND f.mosque_id = ${mosqueId}
    LEFT JOIN mosque_registrations mr ON fm.member_kind = 'student' AND mr.id = fm.member_id AND mr.mosque_id = ${mosqueId}
    LEFT JOIN mosque_members mm ON fm.member_kind = 'member' AND mm.id = fm.member_id AND mm.mosque_id = ${mosqueId}
    WHERE COALESCE(mr.name, mm.name) IS NOT NULL
  `;
  return rows.map((row) => ({
    familyId: row.family_id as number,
    memberKind: row.member_kind as MemberKind,
    memberId: row.member_id as number,
    name: row.name as string,
  }));
}

// ————— اللجان —————

export type Committee = {
  id: number;
  mosqueId: number;
  name: string;
  description: string;
  createdAt: string;
  memberCount: number;
};

function rowToCommittee(row: Record<string, unknown>): Committee {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    name: row.name as string,
    description: row.description as string,
    createdAt: row.created_at as string,
    memberCount: (row.member_count as number) ?? 0,
  };
}

export async function listCommittees(mosqueId: number): Promise<Committee[]> {
  const rows = await db().sql`
    SELECT c.id, c.mosque_id, c.name, c.description, c.created_at,
           (SELECT count(*)::int FROM committee_members cm WHERE cm.committee_id = c.id) AS member_count
    FROM committees c
    WHERE c.mosque_id = ${mosqueId}
    ORDER BY c.name
  `;
  return rows.map(rowToCommittee);
}

export async function getCommittee(mosqueId: number, id: number): Promise<Committee | null> {
  const rows = await db().sql`
    SELECT c.id, c.mosque_id, c.name, c.description, c.created_at,
           (SELECT count(*)::int FROM committee_members cm WHERE cm.committee_id = c.id) AS member_count
    FROM committees c
    WHERE c.mosque_id = ${mosqueId} AND c.id = ${id}
  `;
  const row = rows[0];
  return row ? rowToCommittee(row) : null;
}

export async function createCommittee(
  mosqueId: number,
  committee: { name: string; description: string },
): Promise<Committee> {
  const rows = await db().sql`
    INSERT INTO committees (mosque_id, name, description)
    VALUES (${mosqueId}, ${committee.name}, ${committee.description})
    RETURNING id, mosque_id, name, description, created_at
  `;
  return rowToCommittee(rows[0]);
}

export async function deleteCommittee(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`DELETE FROM committees WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

export type CommitteeMember = {
  id: number;
  memberKind: MemberKind;
  memberId: number;
  name: string;
  role: string;
  createdAt: string;
};

/** أعضاء لجنة بأسمائهم — مثل أفراد الأسرة لكن مع الدور (رئيس/عضو…) */
export async function listCommitteeMembers(
  mosqueId: number,
  committeeId: number,
): Promise<CommitteeMember[]> {
  const rows = await db().sql`
    SELECT cm.id, cm.member_kind, cm.member_id, cm.role, cm.created_at,
           COALESCE(mr.name, mm.name) AS name
    FROM committee_members cm
    JOIN committees c ON c.id = cm.committee_id AND c.mosque_id = ${mosqueId}
    LEFT JOIN mosque_registrations mr ON cm.member_kind = 'student' AND mr.id = cm.member_id AND mr.mosque_id = ${mosqueId}
    LEFT JOIN mosque_members mm ON cm.member_kind = 'member' AND mm.id = cm.member_id AND mm.mosque_id = ${mosqueId}
    WHERE cm.committee_id = ${committeeId} AND COALESCE(mr.name, mm.name) IS NOT NULL
    ORDER BY name
  `;
  return rows.map((row) => ({
    id: row.id as number,
    memberKind: row.member_kind as MemberKind,
    memberId: row.member_id as number,
    name: row.name as string,
    role: row.role as string,
    createdAt: row.created_at as string,
  }));
}

/** إضافة عضو بدور نصي — false إن كان مضافاً أصلاً (اللجنة نفسها تُتحقق قبلها) */
export async function addCommitteeMember(
  mosqueId: number,
  committeeId: number,
  kind: MemberKind,
  memberId: number,
  role: string,
): Promise<boolean> {
  const rows = await db().sql`
    INSERT INTO committee_members (committee_id, member_kind, member_id, role)
    SELECT ${committeeId}::int, ${kind}::text, ${memberId}::int, ${role}::text
    WHERE EXISTS (SELECT 1 FROM committees WHERE id = ${committeeId} AND mosque_id = ${mosqueId})
    ON CONFLICT (committee_id, member_kind, member_id) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

export async function removeCommitteeMember(
  mosqueId: number,
  committeeId: number,
  kind: MemberKind,
  memberId: number,
): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM committee_members
    WHERE committee_id = ${committeeId} AND member_kind = ${kind} AND member_id = ${memberId}
      AND committee_id IN (SELECT id FROM committees WHERE mosque_id = ${mosqueId})
    RETURNING id
  `;
  return rows.length > 0;
}

/** كل روابط أعضاء اللجان بأسمائهم لجامع كامل — يغذّي رسم الدماغ ولوحة الشرف */
export async function listCommitteeMemberLinks(
  mosqueId: number,
): Promise<{ committeeId: number; memberKind: MemberKind; memberId: number; name: string; role: string }[]> {
  const rows = await db().sql`
    SELECT cm.committee_id, cm.member_kind, cm.member_id, cm.role, COALESCE(mr.name, mm.name) AS name
    FROM committee_members cm
    JOIN committees c ON c.id = cm.committee_id AND c.mosque_id = ${mosqueId}
    LEFT JOIN mosque_registrations mr ON cm.member_kind = 'student' AND mr.id = cm.member_id AND mr.mosque_id = ${mosqueId}
    LEFT JOIN mosque_members mm ON cm.member_kind = 'member' AND mm.id = cm.member_id AND mm.mosque_id = ${mosqueId}
    WHERE COALESCE(mr.name, mm.name) IS NOT NULL
  `;
  return rows.map((row) => ({
    committeeId: row.committee_id as number,
    memberKind: row.member_kind as MemberKind,
    memberId: row.member_id as number,
    name: row.name as string,
    role: row.role as string,
  }));
}

// ————— مهام اللجان (لوحة ثلاث أعمدة) —————

export type TaskStatus = "todo" | "doing" | "done";

export type CommitteeTask = {
  id: number;
  committeeId: number;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  createdAt: string;
};

function rowToTask(row: Record<string, unknown>): CommitteeTask {
  return {
    id: row.id as number,
    committeeId: row.committee_id as number,
    title: row.title as string,
    status: row.status as TaskStatus,
    dueDate: (row.due_date as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listCommitteeTasks(
  mosqueId: number,
  committeeId: number,
): Promise<CommitteeTask[]> {
  const rows = await db().sql`
    SELECT ct.id, ct.committee_id, ct.title, ct.status, ct.due_date::text AS due_date, ct.created_at
    FROM committee_tasks ct
    WHERE ct.committee_id = ${committeeId}
      AND ct.committee_id IN (SELECT id FROM committees WHERE mosque_id = ${mosqueId})
    ORDER BY ct.created_at DESC
  `;
  return rows.map(rowToTask);
}

export async function createCommitteeTask(
  mosqueId: number,
  committeeId: number,
  task: { title: string; dueDate: string | null },
): Promise<CommitteeTask | null> {
  const rows = await db().sql`
    INSERT INTO committee_tasks (committee_id, title, due_date)
    SELECT ${committeeId}::int, ${task.title}::text, ${task.dueDate}::date
    WHERE EXISTS (SELECT 1 FROM committees WHERE id = ${committeeId} AND mosque_id = ${mosqueId})
    RETURNING id, committee_id, title, status, due_date::text AS due_date, created_at
  `;
  return rows[0] ? rowToTask(rows[0]) : null;
}

/** تغيير حالة مهمة — null إن لم توجد بهذه اللجنة (أو ليست من جوامعنا) */
export async function setCommitteeTaskStatus(
  mosqueId: number,
  committeeId: number,
  taskId: number,
  status: TaskStatus,
): Promise<CommitteeTask | null> {
  const rows = await db().sql`
    UPDATE committee_tasks SET status = ${status}
    WHERE id = ${taskId} AND committee_id = ${committeeId}
      AND committee_id IN (SELECT id FROM committees WHERE mosque_id = ${mosqueId})
    RETURNING id, committee_id, title, status, due_date::text AS due_date, created_at
  `;
  return rows[0] ? rowToTask(rows[0]) : null;
}

export async function deleteCommitteeTask(
  mosqueId: number,
  committeeId: number,
  taskId: number,
): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM committee_tasks
    WHERE id = ${taskId} AND committee_id = ${committeeId}
      AND committee_id IN (SELECT id FROM committees WHERE mosque_id = ${mosqueId})
    RETURNING id
  `;
  return rows.length > 0;
}

// ————— التقييم الأسبوعي: معايير الجامع ثم درجات الأسبوع —————

export type Criterion = {
  id: number;
  mosqueId: number;
  name: string;
  maxScore: number;
  sortOrder: number;
  active: boolean;
  createdAt: string;
};

function rowToCriterion(row: Record<string, unknown>): Criterion {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    name: row.name as string,
    maxScore: row.max_score as number,
    sortOrder: row.sort_order as number,
    active: row.active === true,
    createdAt: row.created_at as string,
  };
}

export async function listCriteria(mosqueId: number): Promise<Criterion[]> {
  const rows = await db().sql`
    SELECT id, mosque_id, name, max_score, sort_order, active, created_at
    FROM evaluation_criteria WHERE mosque_id = ${mosqueId}
    ORDER BY sort_order, id
  `;
  return rows.map(rowToCriterion);
}

/** إنشاء معيار — null إن وُجد آخر بنفس الاسم (409 عند المستدعي). الترتيب يُبنى تلقائياً */
export async function createCriterion(
  mosqueId: number,
  criterion: { name: string; maxScore: number },
): Promise<Criterion | null> {
  const conflict = await db().sql`
    SELECT id FROM evaluation_criteria WHERE mosque_id = ${mosqueId} AND name = ${criterion.name}
  `;
  if (conflict[0]) return null;

  const rows = await db().sql`
    INSERT INTO evaluation_criteria (mosque_id, name, max_score, sort_order)
    VALUES (${mosqueId}, ${criterion.name}, ${criterion.maxScore},
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM evaluation_criteria WHERE mosque_id = ${mosqueId}))
    RETURNING id, mosque_id, name, max_score, sort_order, active, created_at
  `;
  return rowToCriterion(rows[0]);
}

/** المقترح الافتراضي للجامع — يضيف الناقص فقط (تعارض الاسم يتجاهل) ويعيد المعايير كلها */
export const SUGGESTED_CRITERIA: readonly { name: string; maxScore: number }[] = [
  { name: "الحضور", maxScore: 10 },
  { name: "الحفظ", maxScore: 10 },
  { name: "المراجعة", maxScore: 10 },
  { name: "البرنامج النوعي", maxScore: 10 },
  { name: "الاجتماع الأسري", maxScore: 10 },
];

export async function seedSuggestedCriteria(mosqueId: number): Promise<Criterion[]> {
  for (const [index, criterion] of SUGGESTED_CRITERIA.entries()) {
    await db().sql`
      INSERT INTO evaluation_criteria (mosque_id, name, max_score, sort_order)
      VALUES (${mosqueId}, ${criterion.name}, ${criterion.maxScore}, ${index + 1})
      ON CONFLICT (mosque_id, name) DO NOTHING
    `;
  }
  return listCriteria(mosqueId);
}

/** تحديث معيار (اسم/درجة عظمى/تفعيل) — null إن لم يوجد بهذا الجامع، و"conflict" إن تكرر الاسم */
export async function updateCriterion(
  mosqueId: number,
  id: number,
  changes: { name?: string; maxScore?: number; active?: boolean },
): Promise<Criterion | "conflict" | null> {
  const existing = await db().sql`
    SELECT id, mosque_id, name, max_score, sort_order, active, created_at
    FROM evaluation_criteria WHERE mosque_id = ${mosqueId} AND id = ${id}
  `;
  if (!existing[0]) return null;

  const name = changes.name ?? (existing[0].name as string);
  const maxScore = changes.maxScore ?? (existing[0].max_score as number);
  const active = changes.active ?? existing[0].active === true;

  if (changes.name !== undefined && name !== (existing[0].name as string)) {
    const conflict = await db().sql`
      SELECT id FROM evaluation_criteria WHERE mosque_id = ${mosqueId} AND name = ${name} AND id <> ${id}
    `;
    if (conflict[0]) return "conflict";
  }

  const rows = await db().sql`
    UPDATE evaluation_criteria SET name = ${name}, max_score = ${maxScore}, active = ${active}
    WHERE mosque_id = ${mosqueId} AND id = ${id}
    RETURNING id, mosque_id, name, max_score, sort_order, active, created_at
  `;
  return rows[0] ? rowToCriterion(rows[0]) : null;
}

export async function deleteCriterion(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM evaluation_criteria WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

/** أهداف التقييم لأسبوع ما: الأسر أو الطلاب — بأسمائها فقط */
export async function listEvaluationTargets(
  mosqueId: number,
  kind: TargetKind,
): Promise<{ id: number; name: string }[]> {
  const rows =
    kind === "family"
      ? await db().sql`SELECT id, name FROM families WHERE mosque_id = ${mosqueId} ORDER BY name`
      : await db().sql`SELECT id, name FROM mosque_registrations WHERE mosque_id = ${mosqueId} ORDER BY name`;
  return rows.map((row) => ({ id: row.id as number, name: row.name as string }));
}

export type EvaluationEntry = {
  targetId: number;
  criterionId: number;
  score: number;
  note: string;
};

export async function listWeekEvaluations(
  mosqueId: number,
  weekStart: string,
  targetKind: TargetKind,
): Promise<EvaluationEntry[]> {
  const rows = await db().sql`
    SELECT target_id, criterion_id, score, note
    FROM evaluations
    WHERE mosque_id = ${mosqueId} AND week_start = ${weekStart} AND target_kind = ${targetKind}
  `;
  return rows.map((row) => ({
    targetId: row.target_id as number,
    criterionId: row.criterion_id as number,
    score: row.score as number,
    note: row.note as string,
  }));
}

/**
 * حفظ درجات الأسبوع — upsert: الخلية الواحدة (أسبوع، هدف، معيار) فريدة
 * بجدول البيانات، فالحفظ الجديد يستبدل القديم. المدخلات صُحّحت قبلها
 * بالمسار (المعيار من جوامعنا، الدرجة 0..الكبرى، الهدف موجود).
 */
export async function upsertEvaluations(
  mosqueId: number,
  weekStart: string,
  targetKind: TargetKind,
  entries: EvaluationEntry[],
): Promise<void> {
  // دفعات صغيرة حتى لا تُغرق مجمّع الاتصالات بمئات الاستعلامات المتوازية
  for (let i = 0; i < entries.length; i += 20) {
    await Promise.all(
      entries.slice(i, i + 20).map((entry) => db().sql`
        INSERT INTO evaluations (mosque_id, week_start, target_kind, target_id, criterion_id, score, note)
        VALUES (${mosqueId}, ${weekStart}, ${targetKind}, ${entry.targetId}, ${entry.criterionId}, ${entry.score}, ${entry.note})
        ON CONFLICT (week_start, target_kind, target_id, criterion_id)
        DO UPDATE SET score = excluded.score, note = excluded.note, updated_at = now()
      `),
    );
  }
}

// ————— الأوسمة: تعريفات الجامع ثم منحها للأهداف —————

/** هدف الوسام: طالب (mosque_registrations) أو أسرة أو عضو حر — أوسع من هدف التقييم */
export type BadgeTargetKind = "student" | "family" | "member";

export type Badge = {
  id: number;
  mosqueId: number;
  name: string;
  icon: string;
  description: string;
  criteriaNote: string;
  createdAt: string;
  awardCount: number;
};

function rowToBadge(row: Record<string, unknown>): Badge {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    name: row.name as string,
    icon: row.icon as string,
    description: row.description as string,
    criteriaNote: row.criteria_note as string,
    createdAt: row.created_at as string,
    awardCount: (row.award_count as number) ?? 0,
  };
}

export async function listBadges(mosqueId: number): Promise<Badge[]> {
  const rows = await db().sql`
    SELECT b.id, b.mosque_id, b.name, b.icon, b.description, b.criteria_note, b.created_at,
           (SELECT count(*)::int FROM badge_awards ba WHERE ba.badge_id = b.id) AS award_count
    FROM badges b
    WHERE b.mosque_id = ${mosqueId}
    ORDER BY b.created_at, b.id
  `;
  return rows.map(rowToBadge);
}

export async function getBadge(mosqueId: number, id: number): Promise<Badge | null> {
  const rows = await db().sql`
    SELECT b.id, b.mosque_id, b.name, b.icon, b.description, b.criteria_note, b.created_at,
           (SELECT count(*)::int FROM badge_awards ba WHERE ba.badge_id = b.id) AS award_count
    FROM badges b
    WHERE b.mosque_id = ${mosqueId} AND b.id = ${id}
  `;
  return rows[0] ? rowToBadge(rows[0]) : null;
}

/** إنشاء وسام — null إن وُجد آخر بنفس الاسم (409 عند المستدعي) */
export async function createBadge(
  mosqueId: number,
  badge: { name: string; icon: string; description: string; criteriaNote: string },
): Promise<Badge | null> {
  const conflict = await db().sql`SELECT id FROM badges WHERE mosque_id = ${mosqueId} AND name = ${badge.name}`;
  if (conflict[0]) return null;

  const rows = await db().sql`
    INSERT INTO badges (mosque_id, name, icon, description, criteria_note)
    VALUES (${mosqueId}, ${badge.name}, ${badge.icon}, ${badge.description}, ${badge.criteriaNote})
    RETURNING id, mosque_id, name, icon, description, criteria_note, created_at, 0 AS award_count
  `;
  return rowToBadge(rows[0]);
}

/** المقترح الافتراضي — يضيف الناقص فقط (تعارض الاسم يتجاهل) */
export const SUGGESTED_BADGES: readonly { name: string; icon: string; description: string; criteriaNote: string }[] = [
  { name: "المتميز", icon: "🏅", description: "أعلى درجة بالتقييم الأسبوعي.", criteriaNote: "الأول بترتيب الأسبوع." },
  { name: "الحافظ المتقن", icon: "📖", description: "إتقان الحفظ والمراجعة.", criteriaNote: "إتقان 75٪ فأكثر." },
  { name: "الملتزم بالحضور", icon: "⏰", description: "حضور منتظم بلا غياب.", criteriaNote: "حضور كامل للأسبوع." },
  { name: "المبادر", icon: "🤝", description: "مبادرة ومشاركة بأعمال الجامع.", criteriaNote: "مشاركة فعلية بالأنشطة." },
  { name: "نجم الأسبوع", icon: "⭐", description: "الطالب المثالي لهذا الأسبوع.", criteriaNote: "يختاره المعلّم كل أسبوع." },
];

export async function seedSuggestedBadges(mosqueId: number): Promise<Badge[]> {
  for (const badge of SUGGESTED_BADGES) {
    await db().sql`
      INSERT INTO badges (mosque_id, name, icon, description, criteria_note)
      VALUES (${mosqueId}, ${badge.name}, ${badge.icon}, ${badge.description}, ${badge.criteriaNote})
      ON CONFLICT (mosque_id, name) DO NOTHING
    `;
  }
  return listBadges(mosqueId);
}

/** حذف الوسام يحذف منحه معه (تسلسل بالقاعدة) */
export async function deleteBadge(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`DELETE FROM badges WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** اسم هدف وسام من أفراد هذا الجامع، أو null — تحقق قبل المنح */
export async function findBadgeTargetName(
  mosqueId: number,
  kind: BadgeTargetKind,
  targetId: number,
): Promise<string | null> {
  if (kind === "family") {
    const rows = await db().sql`SELECT name FROM families WHERE mosque_id = ${mosqueId} AND id = ${targetId}`;
    return rows[0] ? (rows[0].name as string) : null;
  }
  return findMemberName(mosqueId, kind, targetId);
}

export type BadgeAward = {
  id: number;
  badgeId: number;
  badgeName: string;
  icon: string;
  targetKind: BadgeTargetKind;
  targetId: number;
  targetName: string;
  awardedAt: string;
  note: string;
};

function rowToAward(row: Record<string, unknown>): BadgeAward {
  return {
    id: row.id as number,
    badgeId: row.badge_id as number,
    badgeName: row.badge_name as string,
    icon: row.icon as string,
    targetKind: row.target_kind as BadgeTargetKind,
    targetId: row.target_id as number,
    targetName: row.target_name as string,
    awardedAt: row.awarded_at as string,
    note: row.note as string,
  };
}

/** اسم الهدف عبر JOIN متعدد الأشكال — الأهداف المحذوفة تُستبعد (لا أيتام) */
export async function listRecentAwards(mosqueId: number, limit = 20): Promise<BadgeAward[]> {
  const rows = await db().sql`
    SELECT ba.id, ba.badge_id, b.name AS badge_name, b.icon, ba.target_kind, ba.target_id,
           COALESCE(mr.name, f.name, mm.name) AS target_name,
           ba.awarded_at::text AS awarded_at, ba.note
    FROM badge_awards ba
    JOIN badges b ON b.id = ba.badge_id
    LEFT JOIN mosque_registrations mr ON ba.target_kind = 'student' AND mr.id = ba.target_id AND mr.mosque_id = ba.mosque_id
    LEFT JOIN families f ON ba.target_kind = 'family' AND f.id = ba.target_id AND f.mosque_id = ba.mosque_id
    LEFT JOIN mosque_members mm ON ba.target_kind = 'member' AND mm.id = ba.target_id AND mm.mosque_id = ba.mosque_id
    WHERE ba.mosque_id = ${mosqueId} AND COALESCE(mr.name, f.name, mm.name) IS NOT NULL
    ORDER BY ba.awarded_at DESC, ba.id DESC
    LIMIT ${limit}
  `;
  return rows.map(rowToAward);
}

/** كل منح وسام واحد (بترتيب أحدثها) */
export async function listBadgeAwards(mosqueId: number, badgeId: number): Promise<BadgeAward[]> {
  const rows = await db().sql`
    SELECT ba.id, ba.badge_id, b.name AS badge_name, b.icon, ba.target_kind, ba.target_id,
           COALESCE(mr.name, f.name, mm.name) AS target_name,
           ba.awarded_at::text AS awarded_at, ba.note
    FROM badge_awards ba
    JOIN badges b ON b.id = ba.badge_id
    LEFT JOIN mosque_registrations mr ON ba.target_kind = 'student' AND mr.id = ba.target_id AND mr.mosque_id = ba.mosque_id
    LEFT JOIN families f ON ba.target_kind = 'family' AND f.id = ba.target_id AND f.mosque_id = ba.mosque_id
    LEFT JOIN mosque_members mm ON ba.target_kind = 'member' AND mm.id = mm.id AND mm.mosque_id = ba.mosque_id
    WHERE ba.mosque_id = ${mosqueId} AND ba.badge_id = ${badgeId}
      AND COALESCE(mr.name, f.name, mm.name) IS NOT NULL
    ORDER BY ba.awarded_at DESC, ba.id DESC
  `;
  return rows.map(rowToAward);
}

/** أوسمة هدف واحد — لعرضها بصفحة الأوسمة */
export async function listTargetAwards(
  mosqueId: number,
  kind: BadgeTargetKind,
  targetId: number,
): Promise<BadgeAward[]> {
  const rows = await db().sql`
    SELECT ba.id, ba.badge_id, b.name AS badge_name, b.icon, ba.target_kind, ba.target_id,
           COALESCE(mr.name, f.name, mm.name) AS target_name,
           ba.awarded_at::text AS awarded_at, ba.note
    FROM badge_awards ba
    JOIN badges b ON b.id = ba.badge_id
    LEFT JOIN mosque_registrations mr ON ba.target_kind = 'student' AND mr.id = ba.target_id AND mr.mosque_id = ba.mosque_id
    LEFT JOIN families f ON ba.target_kind = 'family' AND f.id = ba.target_id AND f.mosque_id = ba.mosque_id
    LEFT JOIN mosque_members mm ON ba.target_kind = 'member' AND mm.id = ba.target_id AND mm.mosque_id = ba.mosque_id
    WHERE ba.mosque_id = ${mosqueId} AND ba.target_kind = ${kind} AND ba.target_id = ${targetId}
      AND COALESCE(mr.name, f.name, mm.name) IS NOT NULL
    ORDER BY ba.awarded_at DESC, ba.id DESC
  `;
  return rows.map(rowToAward);
}

/**
 * منح وسام — الوسام والهدف من هذا الجامع (تحقق قبله بالمسار)، والفريد
 * (وسام، هدف، يوم) يمنع التكرار: "duplicate" عند المحاولة الثانية بنفس اليوم.
 */
export async function awardBadge(
  mosqueId: number,
  badgeId: number,
  kind: BadgeTargetKind,
  targetId: number,
  awardedAt: string,
  note: string,
): Promise<BadgeAward | "duplicate" | null> {
  const rows = await db().sql`
    INSERT INTO badge_awards (badge_id, mosque_id, target_kind, target_id, awarded_at, note)
    SELECT ${badgeId}::int, ${mosqueId}::int, ${kind}::text, ${targetId}::int, ${awardedAt}::date, ${note}::text
    WHERE EXISTS (SELECT 1 FROM badges WHERE id = ${badgeId} AND mosque_id = ${mosqueId})
    ON CONFLICT (badge_id, target_kind, target_id, awarded_at) DO NOTHING
    RETURNING id, badge_id, awarded_at::text AS awarded_at, note, target_kind, target_id
  `;
  if (!rows[0]) {
    return (await getBadge(mosqueId, badgeId)) ? "duplicate" : null;
  }

  const badge = await getBadge(mosqueId, badgeId);
  const targetName = await findBadgeTargetName(mosqueId, kind, targetId);
  return {
    id: rows[0].id as number,
    badgeId,
    badgeName: badge?.name ?? "",
    icon: badge?.icon ?? "",
    targetKind: kind,
    targetId,
    targetName: targetName ?? "",
    awardedAt: rows[0].awarded_at as string,
    note: rows[0].note as string,
  };
}

/** كل روابط المنح بأسمائها لجامع كامل — يغذّي رسم الدماغ ولوحة الشرف */
export async function listBadgeAwardLinks(
  mosqueId: number,
): Promise<{ badgeId: number; badgeName: string; icon: string; targetKind: BadgeTargetKind; targetId: number; targetName: string }[]> {
  const rows = await db().sql`
    SELECT ba.badge_id, b.name AS badge_name, b.icon, ba.target_kind, ba.target_id,
           COALESCE(mr.name, f.name, mm.name) AS target_name
    FROM badge_awards ba
    JOIN badges b ON b.id = ba.badge_id AND b.mosque_id = ${mosqueId}
    LEFT JOIN mosque_registrations mr ON ba.target_kind = 'student' AND mr.id = ba.target_id AND mr.mosque_id = ${mosqueId}
    LEFT JOIN families f ON ba.target_kind = 'family' AND f.id = ba.target_id AND f.mosque_id = ${mosqueId}
    LEFT JOIN mosque_members mm ON ba.target_kind = 'member' AND mm.id = ba.target_id AND mm.mosque_id = ${mosqueId}
    WHERE ba.mosque_id = ${mosqueId} AND COALESCE(mr.name, f.name, mm.name) IS NOT NULL
    ORDER BY b.created_at, b.id, ba.awarded_at DESC
  `;
  return rows.map((row) => ({
    badgeId: row.badge_id as number,
    badgeName: row.badge_name as string,
    icon: row.icon as string,
    targetKind: row.target_kind as BadgeTargetKind,
    targetId: row.target_id as number,
    targetName: row.target_name as string,
  }));
}

// ————— الجدول الأسبوعي: فترة × خانة —————

export type SchedulePeriod = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha" | "other";
export type ProgramKind = "halaqah" | "family" | "committee" | "lecture" | "sport" | "cultural" | "other";

export type ScheduleSlot = {
  id: number;
  mosqueId: number;
  dayOfWeek: number;
  period: SchedulePeriod;
  startTime: string | null;
  title: string;
  programKind: ProgramKind;
  refId: number | null;
  location: string | null;
  notes: string | null;
  createdAt: string;
};

function rowToSlot(row: Record<string, unknown>): ScheduleSlot {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    dayOfWeek: row.day_of_week as number,
    period: row.period as SchedulePeriod,
    startTime: (row.start_time as string | null) ?? null,
    title: row.title as string,
    programKind: row.program_kind as ProgramKind,
    refId: (row.ref_id as number | null) ?? null,
    location: (row.location as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listScheduleSlots(mosqueId: number): Promise<ScheduleSlot[]> {
  const rows = await db().sql`
    SELECT id, mosque_id, day_of_week, period, start_time, title, program_kind, ref_id, location, notes, created_at
    FROM schedule_slots
    WHERE mosque_id = ${mosqueId}
    ORDER BY day_of_week, start_time NULLS FIRST, title
  `;
  return rows.map(rowToSlot);
}

/** إضافة خانة — ref_id تحقق المسار أنها من الجامع نفسه (أو null) */
export async function createScheduleSlot(
  mosqueId: number,
  slot: {
    dayOfWeek: number;
    period: SchedulePeriod;
    startTime: string | null;
    title: string;
    programKind: ProgramKind;
    refId: number | null;
    location: string | null;
    notes: string | null;
  },
): Promise<ScheduleSlot> {
  const rows = await db().sql`
    INSERT INTO schedule_slots (mosque_id, day_of_week, period, start_time, title, program_kind, ref_id, location, notes)
    VALUES (${mosqueId}, ${slot.dayOfWeek}, ${slot.period}, ${slot.startTime}, ${slot.title}, ${slot.programKind},
            ${slot.refId}, ${slot.location}, ${slot.notes})
    RETURNING id, mosque_id, day_of_week, period, start_time, title, program_kind, ref_id, location, notes, created_at
  `;
  return rowToSlot(rows[0]);
}

/** تعديل خانة — null إن لم توجد بهذا الجامع */
export async function updateScheduleSlot(
  mosqueId: number,
  id: number,
  changes: {
    dayOfWeek: number;
    period: SchedulePeriod;
    startTime: string | null;
    title: string;
    programKind: ProgramKind;
    refId: number | null;
    location: string | null;
    notes: string | null;
  },
): Promise<ScheduleSlot | null> {
  const rows = await db().sql`
    UPDATE schedule_slots SET
      day_of_week = ${changes.dayOfWeek}, period = ${changes.period}, start_time = ${changes.startTime},
      title = ${changes.title}, program_kind = ${changes.programKind}, ref_id = ${changes.refId},
      location = ${changes.location}, notes = ${changes.notes}
    WHERE mosque_id = ${mosqueId} AND id = ${id}
    RETURNING id, mosque_id, day_of_week, period, start_time, title, program_kind, ref_id, location, notes, created_at
  `;
  return rows[0] ? rowToSlot(rows[0]) : null;
}

export async function deleteScheduleSlot(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM schedule_slots WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

/** ref_id لخانة جدول يجب أن يشير لكيان موجود بهذا الجامع نفسه — رسالة خطأ أو null */
export async function checkScheduleRef(
  mosqueId: number,
  slot: { programKind: ProgramKind; refId: number | null },
): Promise<string | null> {
  if (slot.refId === null) return null;
  if (slot.programKind === "halaqah") {
    const halaqah = await getHalaqah(slot.refId);
    return halaqah && halaqah.mosqueId === mosqueId ? null : "المرتبط ليس من هذا الجامع";
  }
  if (slot.programKind === "family") {
    return (await getFamily(mosqueId, slot.refId)) !== null ? null : "المرتبط ليس من هذا الجامع";
  }
  if (slot.programKind === "committee") {
    return (await getCommittee(mosqueId, slot.refId)) !== null ? null : "المرتبط ليس من هذا الجامع";
  }
  return null;
}

// ————— التقارير: قراءات مجمّعة لفترة ما (لا جداول جديدة) —————

/** طلبات التسجيل بانتظار التوزيع */
export async function countPendingRegistrations(mosqueId: number): Promise<number> {
  const rows = await db().sql`
    SELECT count(*)::int AS n FROM mosque_registrations
    WHERE mosque_id = ${mosqueId} AND status = 'pending'
  `;
  return Number(rows[0].n);
}

export async function countFamilies(mosqueId: number): Promise<number> {
  const rows = await db().sql`SELECT count(*)::int AS n FROM families WHERE mosque_id = ${mosqueId}`;
  return Number(rows[0].n);
}

/** لجان الجامع مع مهامها المفتوحة — المجموع يغذّي مؤشرات التقرير */
export async function listCommitteeTaskSummaries(mosqueId: number): Promise<{ id: number; name: string; openTasks: number }[]> {
  const rows = await db().sql`
    SELECT c.id, c.name, count(ct.id) FILTER (WHERE ct.status <> 'done')::int AS open_tasks
    FROM committees c
    LEFT JOIN committee_tasks ct ON ct.committee_id = c.id
    WHERE c.mosque_id = ${mosqueId}
    GROUP BY c.id, c.name
    ORDER BY c.name
  `;
  return rows.map((row) => ({ id: row.id as number, name: row.name as string, openTasks: row.open_tasks as number }));
}

export type EvaluationSummaryRow = { targetId: number; name: string; total: number; maxTotal: number };

/**
 * ملخص تقييمات فترة لهدف واحد من النوع: مجموع درجاته عبر أسابيع الفترة
 * ومجميع درجاتها العظمى — لاحتساب النسبة والترتيب. الهدف الأسير بلا
 * معيار (حذف معياره) لا يظهر إذ join المعيار inner.
 */
export async function listEvaluationSummaries(
  mosqueId: number,
  from: string,
  to: string,
  kind: TargetKind,
): Promise<EvaluationSummaryRow[]> {
  const rows =
    kind === "family"
      ? await db().sql`
          SELECT e.target_id, t.name, SUM(e.score)::int AS total, SUM(ec.max_score)::int AS max_total
          FROM evaluations e
          JOIN evaluation_criteria ec ON ec.id = e.criterion_id
          JOIN families t ON e.target_kind = 'family' AND t.id = e.target_id AND t.mosque_id = e.mosque_id
          WHERE e.mosque_id = ${mosqueId} AND e.target_kind = 'family'
            AND e.week_start >= ${from}::date AND e.week_start <= ${to}::date
          GROUP BY e.target_id, t.name
          ORDER BY total DESC, t.name
        `
      : await db().sql`
          SELECT e.target_id, t.name, SUM(e.score)::int AS total, SUM(ec.max_score)::int AS max_total
          FROM evaluations e
          JOIN evaluation_criteria ec ON ec.id = e.criterion_id
          JOIN mosque_registrations t ON e.target_kind = 'student' AND t.id = e.target_id AND t.mosque_id = e.mosque_id
          WHERE e.mosque_id = ${mosqueId} AND e.target_kind = 'student'
            AND e.week_start >= ${from}::date AND e.week_start <= ${to}::date
          GROUP BY e.target_id, t.name
          ORDER BY total DESC, t.name
        `;
  return rows.map((row) => ({
    targetId: row.target_id as number,
    name: row.name as string,
    total: row.total as number,
    maxTotal: row.max_total as number,
  }));
}

/** عدد الأوسمة الممنوحة خلال الفترة */
export async function countBadgeAwardsBetween(mosqueId: number, from: string, to: string): Promise<number> {
  const rows = await db().sql`
    SELECT count(*)::int AS n FROM badge_awards
    WHERE mosque_id = ${mosqueId} AND awarded_at >= ${from}::date AND awarded_at <= ${to}::date
  `;
  return Number(rows[0].n);
}

/** أكثر الأوسمة منحاً خلال الفترة */
export async function listBadgeTopBetween(
  mosqueId: number,
  from: string,
  to: string,
): Promise<{ icon: string; name: string; count: number }[]> {
  const rows = await db().sql`
    SELECT b.icon, b.name, count(*)::int AS count
    FROM badge_awards ba
    JOIN badges b ON b.id = ba.badge_id AND b.mosque_id = ${mosqueId}
    WHERE ba.mosque_id = ${mosqueId} AND ba.awarded_at >= ${from}::date AND ba.awarded_at <= ${to}::date
    GROUP BY b.id, b.icon, b.name
    ORDER BY count DESC, b.name
  `;
  return rows.map((row) => ({ icon: row.icon as string, name: row.name as string, count: row.count as number }));
}

/** أوسمة الطلاب الممنوحة خلال الفترة (أساس درجة البرامج بلوحة الشرف) */
export async function listStudentBadgeAwardsBetween(
  mosqueId: number,
  from: string,
  to: string,
): Promise<{ targetId: number; name: string; icon: string }[]> {
  const rows = await db().sql`
    SELECT ba.target_id, b.name, b.icon
    FROM badge_awards ba
    JOIN badges b ON b.id = ba.badge_id AND b.mosque_id = ${mosqueId}
    WHERE ba.mosque_id = ${mosqueId} AND ba.target_kind = 'student'
      AND ba.awarded_at >= ${from}::date AND ba.awarded_at <= ${to}::date
    ORDER BY ba.awarded_at, ba.id
  `;
  return rows.map((row) => ({
    targetId: row.target_id as number,
    name: row.name as string,
    icon: row.icon as string,
  }));
}

/** عدد الأنشطة المؤرَّخة (activity_date) خلال الفترة */
export async function countActivitiesBetween(mosqueId: number, from: string, to: string): Promise<number> {
  const rows = await db().sql`
    SELECT count(*)::int AS n FROM activities
    WHERE mosque_id = ${mosqueId} AND activity_date >= ${from}::date AND activity_date <= ${to}::date
  `;
  return Number(rows[0].n);
}

// ————— أرشيف الأنشطة: أنشطة بصور (BYTEA مضغوطة) وروابط فيديو —————
// البايتات تُمرَّر وتُقرأ base64 عبر decode/encode حتى لا نعتمد على طريقة سائق
// القاعدة (pg أو neon-http) بترميز BYTEA.

export type Activity = {
  id: number;
  mosqueId: number;
  title: string;
  description: string;
  activityDate: string;
  tagKind: TagKind | null;
  tagId: number | null;
  tagName: string | null;
  createdAt: string;
  photoCount: number;
  videoCount: number;
  coverMediaId: number | null;
};

function rowToActivity(row: Record<string, unknown>): Activity {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    title: row.title as string,
    description: row.description as string,
    activityDate: row.activity_date as string,
    tagKind: (row.tag_kind as TagKind | null) ?? null,
    tagId: (row.tag_id as number | null) ?? null,
    tagName: (row.tag_name as string | null) ?? null,
    createdAt: row.created_at as string,
    photoCount: (row.photo_count as number) ?? 0,
    videoCount: (row.video_count as number) ?? 0,
    coverMediaId: (row.cover_media_id as number | null) ?? null,
  };
}

/** أنشطة الجامع الأحدث أولاً، باسم الوسم وغلاف (أول صورة) وعدّادات */
export async function listActivities(mosqueId: number): Promise<Activity[]> {
  const rows = await db().sql`
    SELECT a.id, a.mosque_id, a.title, a.description, a.activity_date::text AS activity_date,
           a.tag_kind, a.tag_id, a.created_at,
           CASE a.tag_kind
             WHEN 'halaqah'   THEN (SELECT name FROM halaqahs   WHERE id = a.tag_id AND mosque_id = a.mosque_id)
             WHEN 'family'    THEN (SELECT name FROM families   WHERE id = a.tag_id AND mosque_id = a.mosque_id)
             WHEN 'committee' THEN (SELECT name FROM committees WHERE id = a.tag_id AND mosque_id = a.mosque_id)
           END AS tag_name,
           (SELECT count(*)::int FROM activity_media m WHERE m.activity_id = a.id AND m.kind = 'photo') AS photo_count,
           (SELECT count(*)::int FROM activity_media m WHERE m.activity_id = a.id AND m.kind = 'video_link') AS video_count,
           (SELECT m.id FROM activity_media m WHERE m.activity_id = a.id AND m.kind = 'photo'
            ORDER BY m.sort_order, m.id LIMIT 1) AS cover_media_id
    FROM activities a
    WHERE a.mosque_id = ${mosqueId}
    ORDER BY a.activity_date DESC, a.id DESC
  `;
  return rows.map(rowToActivity);
}

export async function getActivity(mosqueId: number, id: number): Promise<Activity | null> {
  const rows = await db().sql`
    SELECT a.id, a.mosque_id, a.title, a.description, a.activity_date::text AS activity_date,
           a.tag_kind, a.tag_id, a.created_at,
           CASE a.tag_kind
             WHEN 'halaqah'   THEN (SELECT name FROM halaqahs   WHERE id = a.tag_id AND mosque_id = a.mosque_id)
             WHEN 'family'    THEN (SELECT name FROM families   WHERE id = a.tag_id AND mosque_id = a.mosque_id)
             WHEN 'committee' THEN (SELECT name FROM committees WHERE id = a.tag_id AND mosque_id = a.mosque_id)
           END AS tag_name,
           (SELECT count(*)::int FROM activity_media m WHERE m.activity_id = a.id AND m.kind = 'photo') AS photo_count,
           (SELECT count(*)::int FROM activity_media m WHERE m.activity_id = a.id AND m.kind = 'video_link') AS video_count,
           (SELECT m.id FROM activity_media m WHERE m.activity_id = a.id AND m.kind = 'photo'
            ORDER BY m.sort_order, m.id LIMIT 1) AS cover_media_id
    FROM activities a
    WHERE a.mosque_id = ${mosqueId} AND a.id = ${id}
  `;
  return rows[0] ? rowToActivity(rows[0]) : null;
}

/** هل الوسم (حلقة/أسرة/لجنة) موجود في هذا الجامع نفسه؟ */
export async function tagBelongsToMosque(mosqueId: number, kind: TagKind, tagId: number): Promise<boolean> {
  const rows =
    kind === "halaqah"
      ? await db().sql`SELECT id FROM halaqahs WHERE mosque_id = ${mosqueId} AND id = ${tagId}`
      : kind === "family"
        ? await db().sql`SELECT id FROM families WHERE mosque_id = ${mosqueId} AND id = ${tagId}`
        : await db().sql`SELECT id FROM committees WHERE mosque_id = ${mosqueId} AND id = ${tagId}`;
  return rows.length > 0;
}

export async function createActivity(
  mosqueId: number,
  input: { title: string; description: string; activityDate: string; tagKind: TagKind | null; tagId: number | null },
): Promise<number> {
  const rows = await db().sql`
    INSERT INTO activities (mosque_id, title, description, activity_date, tag_kind, tag_id)
    VALUES (${mosqueId}, ${input.title}, ${input.description}, ${input.activityDate}::date,
            ${input.tagKind}::text, ${input.tagId}::int)
    RETURNING id
  `;
  return Number(rows[0].id);
}

/** حذف النشاط يزيل وسائطه معه (تسلسل بالقاعدة) */
export async function deleteActivity(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`DELETE FROM activities WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

export type ActivityMedia = {
  id: number;
  kind: "photo" | "video_link";
  mime: string | null;
  sizeBytes: number | null;
  url: string | null;
};

/** وسائط النشاط بلا البايتات (الصورة تُجلب من مسارها) */
export async function listActivityMedia(mosqueId: number, activityId: number): Promise<ActivityMedia[]> {
  const rows = await db().sql`
    SELECT id, kind, mime, size_bytes, url
    FROM activity_media
    WHERE mosque_id = ${mosqueId} AND activity_id = ${activityId}
    ORDER BY sort_order, id
  `;
  return rows.map((row) => ({
    id: row.id as number,
    kind: row.kind as ActivityMedia["kind"],
    mime: (row.mime as string | null) ?? null,
    sizeBytes: (row.size_bytes as number | null) ?? null,
    url: (row.url as string | null) ?? null,
  }));
}

export async function countMosquePhotos(mosqueId: number): Promise<number> {
  const rows = await db().sql`
    SELECT count(*)::int AS n FROM activity_media WHERE mosque_id = ${mosqueId} AND kind = 'photo'
  `;
  return Number(rows[0]?.n ?? 0);
}

/**
 * إضافة صورة — الحد الأعلى للجامع يُفرض داخل نفس جملة الإدراج (لا سباق بين
 * رفعين متزامنين). "full" لو امتلأ الحد، null لو النشاط ليس من هذا الجامع.
 */
export async function addActivityPhoto(
  mosqueId: number,
  activityId: number,
  mime: string,
  data: Uint8Array,
): Promise<{ id: number } | "full" | null> {
  const b64 = Buffer.from(data).toString("base64");
  const rows = await db().sql`
    INSERT INTO activity_media (activity_id, mosque_id, kind, mime, bytes, size_bytes, sort_order)
    SELECT ${activityId}::int, ${mosqueId}::int, 'photo', ${mime}::text, decode(${b64}::text, 'base64'), ${data.length}::int,
           (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM activity_media WHERE activity_id = ${activityId})
    WHERE EXISTS (SELECT 1 FROM activities WHERE id = ${activityId} AND mosque_id = ${mosqueId})
      AND (SELECT count(*) FROM activity_media WHERE mosque_id = ${mosqueId} AND kind = 'photo') < ${MAX_PHOTOS_PER_MOSQUE}
    RETURNING id
  `;
  if (rows[0]) return { id: Number(rows[0].id) };
  const exists = await db().sql`SELECT id FROM activities WHERE id = ${activityId} AND mosque_id = ${mosqueId}`;
  return exists[0] ? "full" : null;
}

export async function addActivityVideoLink(
  mosqueId: number,
  activityId: number,
  url: string,
): Promise<{ id: number } | null> {
  const rows = await db().sql`
    INSERT INTO activity_media (activity_id, mosque_id, kind, url, sort_order)
    SELECT ${activityId}::int, ${mosqueId}::int, 'video_link', ${url}::text,
           (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM activity_media WHERE activity_id = ${activityId})
    WHERE EXISTS (SELECT 1 FROM activities WHERE id = ${activityId} AND mosque_id = ${mosqueId})
    RETURNING id
  `;
  return rows[0] ? { id: Number(rows[0].id) } : null;
}

/** بايتات صورة بنوعها المخزَّن — مقيّدة بالجامع والنشاط */
export async function getActivityPhoto(
  mosqueId: number,
  activityId: number,
  mediaId: number,
): Promise<{ mime: string; data: Buffer } | null> {
  const rows = await db().sql`
    SELECT mime, encode(bytes, 'base64') AS b64
    FROM activity_media
    WHERE id = ${mediaId} AND activity_id = ${activityId} AND mosque_id = ${mosqueId} AND kind = 'photo'
  `;
  const row = rows[0];
  return row ? { mime: row.mime as string, data: Buffer.from(row.b64 as string, "base64") } : null;
}

export async function deleteActivityMedia(mosqueId: number, activityId: number, mediaId: number): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM activity_media
    WHERE id = ${mediaId} AND activity_id = ${activityId} AND mosque_id = ${mosqueId}
    RETURNING id
  `;
  return rows.length > 0;
}
