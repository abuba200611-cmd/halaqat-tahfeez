/*
  M5 — الهوية الموحّدة: قواعد مطابقة الحسابات القديمة (teachers / parents /
  mosque_admins / students / super_admins) على الجدولين الجديدين users +
  memberships. دوال نقية بلا قاعدة بيانات — نفس القواعد مطبَّقة حرفياً في
  ترحيل 20261027000000_unified_identity (التعليمة/backfill) وفي
  lib/identity.ts (الحسابات الجديدة)، وهذا الملف هو العقد المشترك المُختبَر
  بينهما: أي تغيير هنا يعني تغيير الترحيل والعكس.
*/

export type MembershipRole =
  | "developer"
  | "mosque_admin"
  | "supervisor"
  | "assistant"
  | "student"
  | "parent";

export type LegacyKind = "teacher" | "parent" | "mosque_admin" | "student" | "super_admin";

/** حقول صف users الجديد — email دوماً بحروف صغيرة أو NULL */
export type NewIdentityUser = {
  displayName: string;
  email: string | null;
  username: string | null;
};

/** حقول صف memberships الجديد — legacyKind+legacyId يشيران للصف القديم */
export type NewIdentityMembership = {
  role: MembershipRole;
  mosqueId: number | null;
  halaqahId: number | null;
  studentId: string | null;
  legacyKind: LegacyKind;
  legacyId: string;
  active: boolean;
};

export type IdentityMapping = { user: NewIdentityUser; membership: NewIdentityMembership };

/** البريد الموحّد: مقصوصاً بحروف صغيرة، أو null للفراغ — عمود users.email يقبل NULL فقط هكذا */
export function normalizeIdentityEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim().toLowerCase();
  return value === "" ? null : value;
}

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed !== "") return trimmed;
  }
  return null;
}

/*
  معرّف الطالب القديم مركّب: students بمفتاح (teacher_id, id) — والعمود
  teacher_id يحمل معرّف الحلقة منذ تعدّد المعلّمين. نرمّزه نصاً
  "halaqahId:studentId" (معرّف الطالب hex لا يحوي ":" أصلاً).
*/
export function studentLegacyId(halaqahId: number, studentId: string): string {
  return `${halaqahId}:${studentId}`;
}

export function parseStudentLegacyId(
  legacyId: string,
): { halaqahId: number; studentId: string } | null {
  const sep = legacyId.indexOf(":");
  if (sep <= 0) return null;
  const halaqahId = Number(legacyId.slice(0, sep));
  const studentId = legacyId.slice(sep + 1);
  return Number.isInteger(halaqahId) && halaqahId > 0 && studentId !== ""
    ? { halaqahId, studentId }
    : null;
}

/*
  مقبض اسم مستخدم اصطناعي للطالب بلا اسم مستخدم حقيقي — مشتق من مفتاحه
  القديم فيكون فريداً وحتمياً، ويتيح مطابقة صف users عند إعادة تشغيل
  الترحيل. لا يُستخدم للدخول أبداً (الدخول يظل من الجداول القديمة).
*/
export function studentHandle(halaqahId: number, studentId: string): string {
  return `student:${studentLegacyId(halaqahId, studentId)}`;
}

/** معلّم → مستخدم ببريده (عمود username القديم يحمل بريداً) + عضوية بدوره الفعلي */
export function mapTeacherIdentity(row: {
  id: number;
  username: string;
  teacherName?: string | null;
  halaqahId: number;
  mosqueId?: number | null;
  role: "supervisor" | "assistant";
  deactivatedAt?: string | Date | null;
}): IdentityMapping {
  const email = normalizeIdentityEmail(row.username);
  return {
    user: {
      displayName: firstNonEmpty(row.teacherName, row.username) ?? row.username,
      email,
      username: null,
    },
    membership: {
      role: row.role,
      mosqueId: row.mosqueId ?? null,
      halaqahId: row.halaqahId,
      studentId: null,
      legacyKind: "teacher",
      legacyId: String(row.id),
      active: (row.deactivatedAt ?? null) === null,
    },
  };
}

/** ولي أمر → مستخدم ببريده + عضوية parent (بلا طالب محدَّد: الأبناء يقرأون من parent_children مباشرة) */
export function mapParentIdentity(row: { id: number; email: string; name: string }): IdentityMapping {
  const email = normalizeIdentityEmail(row.email) ?? `parent:${row.id}`;
  return {
    user: {
      displayName: firstNonEmpty(row.name) ?? email,
      email,
      username: null,
    },
    membership: {
      role: "parent",
      mosqueId: null,
      halaqahId: null,
      studentId: null,
      legacyKind: "parent",
      legacyId: String(row.id),
      active: true,
    },
  };
}

/** مدير جامع → مستخدم باسم المستخدم (ليس بريداً بالضرورة) + عضوية mosque_admin */
export function mapMosqueAdminIdentity(row: { id: number; mosqueId: number; username: string }): IdentityMapping {
  return {
    user: {
      displayName: row.username,
      email: null,
      username: row.username,
    },
    membership: {
      role: "mosque_admin",
      mosqueId: row.mosqueId,
      halaqahId: null,
      studentId: null,
      legacyKind: "mosque_admin",
      legacyId: String(row.id),
      active: true,
    },
  };
}

/** طالب → مستخدم (اسم المستخدم إن وُجد، وإلا مقبض اصطناعي) + عضوية student بدل الطالب نفسه */
export function mapStudentIdentity(row: {
  halaqahId: number;
  id: string;
  name: string;
  username?: string | null;
  mosqueId?: number | null;
  active?: boolean;
}): IdentityMapping {
  const handle = firstNonEmpty(row.username) ?? studentHandle(row.halaqahId, row.id);
  return {
    user: {
      displayName: firstNonEmpty(row.name) ?? handle,
      email: null,
      username: handle,
    },
    membership: {
      role: "student",
      mosqueId: row.mosqueId ?? null,
      halaqahId: row.halaqahId,
      studentId: row.id,
      legacyKind: "student",
      legacyId: studentLegacyId(row.halaqahId, row.id),
      active: row.active ?? true,
    },
  };
}

/** مشرف عام (super_admins) → عضوية developer — جدولها قد يكون فارغاً، بلا أثر إن كان كذلك */
export function mapSuperAdminIdentity(row: { id: number; username: string }): IdentityMapping {
  return {
    user: {
      displayName: row.username,
      email: null,
      username: row.username,
    },
    membership: {
      role: "developer",
      mosqueId: null,
      halaqahId: null,
      studentId: null,
      legacyKind: "super_admin",
      legacyId: String(row.id),
      active: true,
    },
  };
}
