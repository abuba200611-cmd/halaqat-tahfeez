import { currentStudent, currentTeacher } from "@/lib/auth";
import { loginHrefFor, membershipShell, resolveIdentity } from "@/lib/identity";
import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { currentAssociationAdmin } from "@/lib/association-auth";
import { currentParent } from "@/lib/parent-auth";
import { studentLegacyId } from "@/lib/identity-mapping";

/*
  M5 — هوية الجلسة الحالية لمبدّل الأدوار: الدور الحالي، المستخدم الموحّد،
  وكل عضوياته الفعّالة الأخرى مع شرح كل واحدة: هل تبديلها يصدر كوكيها
  مباشرة (نفس نوع الجلسة الحالية — كلمة مروره أُثبتت بهذا الدخول)، أم أن
  نوعها مسجَّل بجلسة صالحة على هذا الجهاز أصلاً (يكفي التنقّل)، أم تحتاج
  كلمة مرورها (رابط دخولها معبَّأ مسبقاً).
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

export async function GET() {
  const identity = await resolveIdentity();
  if (identity.kind === null || identity.current === null) {
    return Response.json({ kind: identity.kind, user: identity.user, current: null, memberships: [] });
  }

  const user = identity.user ?? { email: null, username: null };
  const others = identity.memberships.filter((m) => m.id !== identity.current?.id && m.active);

  const memberships = await Promise.all(
    others.map(async (m) => {
      const shell = membershipShell(m);
      const switchable = shell.kind === identity.kind && shell.kind !== "developer";
      return {
        id: m.id,
        label: shell.label,
        switchable,
        sessionActive: await sessionMatches(shell.kind, m.legacyId),
        home: shell.home,
        loginHref: switchable ? null : loginHrefFor(shell.kind, user),
      };
    }),
  );

  return Response.json({
    kind: identity.kind,
    user: identity.user,
    current: { id: identity.current.id, label: membershipShell(identity.current).label },
    memberships,
  });
}
