import { cookies } from "next/headers";
import { SESSION_COOKIES } from "@/lib/landing";
import { clearStaleSessions, type RoleSessionCheck } from "@/lib/stale-session";
import { clearSessionCookie, clearStudentSessionCookie, currentStudent, currentTeacher } from "@/lib/auth";
import { clearParentSessionCookie, currentParent } from "@/lib/parent-auth";
import { clearMosqueAdminSession, currentMosqueAdmin } from "@/lib/mosque-auth";
import { clearAssociationAdminSession, currentAssociationAdmin } from "@/lib/association-auth";

/*
  يمسح كوكيات الجلسة القديمة/الفاسدة فقط (لا يلمس جلسة صالحة). تستدعيه بوابة
  المعلّم حين لا تجد جلسة، قبل إعادة التوجيه إلى /welcome — فلا يبقى كوكي
  ميّت يمنع proxy.ts من إعادة كتابة "/" إلى الترحيب. يرجع home = صفحة دور
  آخر مسجَّل صالح إن وُجد، فلا نُرسل مديراً مسجَّلاً إلى الترحيب.
  [teacher, student, parent, mosque_admin, association] بترتيب SESSION_COOKIES.
*/

export async function POST() {
  const store = await cookies();
  const has = (name: string) => store.get(name) !== undefined;
  const [teacher, student, parent, mosqueAdmin, association] = SESSION_COOKIES;

  const checks: RoleSessionCheck[] = [
    { role: "teacher", hasCookie: () => has(teacher), validHome: async () => ((await currentTeacher()) ? "/" : null), clear: clearSessionCookie },
    { role: "student", hasCookie: () => has(student), validHome: async () => ((await currentStudent()) ? "/student" : null), clear: clearStudentSessionCookie },
    { role: "parent", hasCookie: () => has(parent), validHome: async () => ((await currentParent()) ? "/parent" : null), clear: clearParentSessionCookie },
    {
      role: "mosque_admin",
      hasCookie: () => has(mosqueAdmin),
      validHome: async () => {
        const admin = await currentMosqueAdmin();
        return admin ? `/mosque/${admin.mosqueId}` : null;
      },
      clear: clearMosqueAdminSession,
    },
    {
      role: "association",
      hasCookie: () => has(association),
      validHome: async () => ((await currentAssociationAdmin()) ? "/association" : null),
      clear: clearAssociationAdminSession,
    },
  ];

  const result = await clearStaleSessions(checks);
  return Response.json({ ok: true, ...result });
}
