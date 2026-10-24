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
  | "parent"
  | "association_admin";

export type LegacyKind = "teacher" | "parent" | "mosque_admin" | "student" | "super_admin" | "association_admin";

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

/** مدير جمعية → مستخدم باسم المستخدم + عضوية association_admin (بلا جامع: الجمعية فوق الجوامع) */
export function mapAssociationAdminIdentity(row: { id: number; username: string }): IdentityMapping {
  return {
    user: {
      displayName: row.username,
      email: null,
      username: row.username,
    },
    membership: {
      role: "association_admin",
      mosqueId: null,
      halaqahId: null,
      studentId: null,
      legacyKind: "association_admin",
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

// ————— مبدّل الأدوار — قواعد العرض النقية —————

export type IdentityKind = "teacher" | "student" | "parent" | "mosque_admin" | "association_admin" | "developer";

/** الحد البنيوي الأدنى من عضوية يكفي لعرضها بمبدّل الأدوار (تشبعه Membership كاملة) */
export type SwitchableMembership = {
  id: number;
  role: MembershipRole;
  legacyKind: LegacyKind;
  legacyId: string;
  active: boolean;
  halaqahId: number | null;
  mosqueId: number | null;
  halaqahName: string | null;
  mosqueName: string | null;
};

/** القشرة التي يقودها الدور + وجهة الهبوط بعد التبديل + التسمية العربية */
export function membershipShell(membership: SwitchableMembership): {
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
    case "association_admin":
      return { kind: "association_admin", home: "/association", label: "مدير جمعية" };
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
    case "association_admin":
      return `/association-login?username=${encodeURIComponent(user.username ?? "")}`;
    case "developer":
      return "/admin";
    default:
      return "/student";
  }
}

/** مرشّح عرض واحد بمبدّل الأدوار: العضوية + فحصاها اللذان يجريهما المستدعي (خادم) */
export type SwitcherCandidate<T extends SwitchableMembership = SwitchableMembership> = {
  membership: T;
  /** الصف القديم الذي تشير إليه العضوية ما زال حياً (الحساب موجود وغير موقوف) */
  live: boolean;
  /** جلسة فعلية من نوع هذه العضوية صالحة الآن على هذا الجهاز وتطابقها */
  sessionActive: boolean;
};

/** ما يُعرض فعلاً للمستخدم في قائمة «تبديل الدور» */
export type SwitcherEntry<T extends SwitchableMembership = SwitchableMembership> = {
  membership: T;
  kind: IdentityKind;
  home: string;
  label: string;
  /** نفس نوع الجلسة الحالية — كلمة مرور هذا النوع أُثبتت بهذا الدخول فيصدر كوكيه مباشرة */
  switchable: boolean;
  sessionActive: boolean;
  loginHref: string | null;
};

/**
 * قواعد عرض عضويات المبدّل (نقية بلا قاعدة بيانات — المسار /api/identity/me
 * يجمع الحقائق ويمرّرها هنا):
 *
 * 1. أدوار يستطيع المستخدم الوصول إليها فعلاً فقط: عضوية حية (الصف القديم
 *    موجود وغير موقوف) وصالحة للدخول — إما أنها من نوع الجلسة الحالية
 *    (تبديل مباشر)، أو أن جلسة من نوعها قائمة على الجهاز أصلاً (التنقّل
 *    يكفي). عضوية نوع آخر بلا جلسة تُخفى كلية: رابطها لا يقود المستخدم
 *    إلا لشاشة دخول بكلمة مرور لا يملكها (خطأ «معلّم يُرسَل لصفحة ولي
 *    أمر» هو ما أصلحته هذه القاعدة).
 * 2. دور واحد فقط = قائمة فارغة (المكوّن يخفي المبدّل كلياً).
 * 3. عضويتان تشيران لنفس الصف القديم (تغيّر دور معلّم مثلاً) = الأولى تكفي.
 * 4. عضوية المطوّر لا تُعرض أبداً — دخول اللوحة بسرّ ADMIN_SECRET لا مسار
 *    تبديل له.
 */
export function switcherMemberships<T extends SwitchableMembership>(
  currentKind: IdentityKind,
  candidates: SwitcherCandidate<T>[],
  user: { email: string | null; username: string | null },
): SwitcherEntry<T>[] {
  const seen = new Set<string>();
  const entries: SwitcherEntry<T>[] = [];
  for (const candidate of candidates) {
    const m = candidate.membership;
    const key = `${m.legacyKind}:${m.legacyId}`;
    if (seen.has(key)) continue; // عضويتان لنفس الصف القديم — الأولى تكفي
    seen.add(key);

    const shell = membershipShell(m);
    const switchable = shell.kind === currentKind && currentKind !== "developer";
    if (!m.active || !candidate.live || shell.kind === "developer") continue;
    if (!switchable && !candidate.sessionActive) continue;

    entries.push({
      membership: m,
      kind: shell.kind,
      home: shell.home,
      label: shell.label,
      switchable,
      sessionActive: candidate.sessionActive,
      loginHref: switchable ? null : loginHrefFor(shell.kind, user),
    });
  }
  return entries;
}
