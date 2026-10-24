import { currentStudent, currentTeacher } from "@/lib/auth";
import { findMosqueAdminById, findStudentAccount, findTeacherById } from "@/lib/db";
import { membershipShell, resolveIdentity, studentLegacyKey, switcherMemberships, type Membership } from "@/lib/identity";
import { findAssociationAdminById } from "@/lib/association-db";
import { findParentById } from "@/lib/parent-db";
import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { currentAssociationAdmin } from "@/lib/association-auth";
import { currentParent } from "@/lib/parent-auth";
import { studentLegacyId } from "@/lib/identity-mapping";

/*
  M5 — هوية الجلسة الحالية لمبدّل الأدوار: الدور الحالي، المستخدم الموحّد،
  وكل عضوية أخرى يستطيع الوصول إليها فعلاً. قواعد العرض النقية في
  switcherMemberships (identity-mapping.ts)؛ هذا المسار يجمع الحقائق فقط:

  - live: الصف القديم الذي تشير إليه العضوية ما زال موجوداً وحياً —
    عضوية بلا حساب حقيقي خلفها لا تُعرض مهما تطابقت البريدات.
  - sessionMatches: جلسة من نوع العضوية قائمة على هذا الجهاز وتطابقها —
    التنقّل إليها يكفي دون إصدار أي كوكي.
*/

async function sessionMatches(kind: string, legacyId: string): Promise<boolean> {
  switch (kind) {
    case "teacher": {
      const teacher = await currentTeacher();
      return teacher !== null && String(teacher.id) === legacyId;
    }
    case "student": {
      const student = await currentStudent();
      return student !== null && studentLegacyId(student.teacherId, student.id) === legacyId;
    }
    case "parent": {
      const parent = await currentParent();
      return parent !== null && String(parent.id) === legacyId;
    }
    case "mosque_admin": {
      const admin = await currentMosqueAdmin();
      return admin !== null && String(admin.id) === legacyId;
    }
    case "association_admin": {
      const admin = await currentAssociationAdmin();
      return admin !== null && String(admin.id) === legacyId;
    }
    default:
      return false;
  }
}

/** الصف القديم الحي خلف العضوية — المعلّم الموقوف والحساب المحذوف = غير حي */
async function membershipLive(m: Membership): Promise<boolean> {
  const id = Number(m.legacyId);
  switch (m.legacyKind) {
    case "teacher": {
      if (!Number.isInteger(id)) return false;
      const teacher = await findTeacherById(id);
      return teacher !== null && !teacher.deactivatedAt;
    }
    case "student": {
      const key = studentLegacyKey(m.legacyId);
      return key ? (await findStudentAccount(key.halaqahId, key.studentId)) !== null : false;
    }
    case "parent":
      return Number.isInteger(id) ? (await findParentById(id)) !== null : false;
    case "mosque_admin":
      return Number.isInteger(id) ? (await findMosqueAdminById(id)) !== null : false;
    case "association_admin":
      return Number.isInteger(id) ? (await findAssociationAdminById(id)) !== null : false;
    default:
      // super_admin: لا مسار تبديل له أصلاً
      return false;
  }
}

export async function GET() {
  const identity = await resolveIdentity();
  if (identity.kind === null || identity.current === null) {
    return Response.json({ kind: identity.kind, user: identity.user, current: null, memberships: [] });
  }

  const others = identity.memberships.filter((m) => m.id !== identity.current?.id);
  const candidates = await Promise.all(
    others.map(async (m) => ({
      membership: m,
      live: await membershipLive(m),
      sessionActive: await sessionMatches(membershipShell(m).kind, m.legacyId),
    })),
  );

  const entries = switcherMemberships(
    identity.kind,
    candidates,
    identity.user ?? { email: null, username: null },
  );

  return Response.json({
    kind: identity.kind,
    user: identity.user,
    current: { id: identity.current.id, label: membershipShell(identity.current).label },
    memberships: entries.map((e) => ({
      id: e.membership.id,
      label: e.label,
      switchable: e.switchable,
      sessionActive: e.sessionActive,
      home: e.home,
      loginHref: e.loginHref,
    })),
  });
}
