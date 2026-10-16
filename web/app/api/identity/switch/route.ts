import { findMosqueAdminById, findStudentAccount, findTeacherById } from "@/lib/db";
import { setSessionCookie, setStudentSessionCookie } from "@/lib/auth";
import { findMembershipById, loginHrefFor, membershipShell, resolveIdentity, studentLegacyKey } from "@/lib/identity";
import { guardImpersonation } from "@/lib/dev-impersonation";
import { setMosqueAdminSessionCookie } from "@/lib/mosque-auth";
import { findParentById } from "@/lib/parent-db";
import { setParentSessionCookie } from "@/lib/parent-auth";

/*
  M5 — تبديل الدور إلى عضوية أخرى لنفس المستخدم. قاعدتا الأمان:
  1. الملكية: العضوية يجب أن تعود لنفس user_id المُثبَت بجلسة الطلب — عضوية
     أي شخص آخر تُرفض بنفس ردّ "غير موجودة" فلا يُكشف حتى وجودها.
  2. لا تصعيد: إصدار كوكي نوعٍ ما يتطلب أن تكون جلسة الطلب الحالية من
     النوع نفسه (كلمة مروره أُدخلت فعلاً بهذا الدخول). عضويات الأنواع
     الأخرى تُعاد برابط دخولها معبَّأً — لا يُصدر كوكي أبداً بلا إثبات
     نوعه ولو تطابقت البريدات ظاهرياً.
  قبل الإصدار يُقرأ الصف القديم الحي نفسه (معلّم موقوف/طالب محذوف = رفض)
  فلا تكفي صلاحية العضوية وحدها.
*/

const GENERIC_REFUSAL = "هذه العضوية غير متاحة";

export async function POST(request: Request) {
  // التبديل يغيّر هوية الجلسة — ممنوع أثناء «عرض كـ» كأي إجراء هدّام آخر
  const impBlocked = await guardImpersonation();
  if (impBlocked) return impBlocked;

  const identity = await resolveIdentity();
  if (identity.kind === null || identity.current === null || identity.user === null) {
    return Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { membershipId?: unknown };
  const membershipId = Number(body.membershipId);
  if (!Number.isInteger(membershipId)) {
    return Response.json({ error: GENERIC_REFUSAL }, { status: 404 });
  }

  const membership = await findMembershipById(membershipId);
  // ملكية مختلفة أو عضوية موقوفة = نفس ردّ "غير موجودة" بلا تمييز بينهما
  if (!membership || !membership.active || membership.userId !== identity.current.userId) {
    return Response.json({ error: GENERIC_REFUSAL }, { status: 404 });
  }

  const shell = membershipShell(membership);
  if (shell.kind !== identity.kind || shell.kind === "developer") {
    return Response.json(
      {
        error: "هذا الدور يحتاج كلمة مروره الخاصة — أدخلها لتفعيله",
        loginHref: loginHrefFor(shell.kind, identity.user),
      },
      { status: 403 },
    );
  }

  // نفس نوع الجلسة الحالية: كلمة مرور هذا النوع أُثبتت — نتحقق من الصف
  // القديم الحي ثم نصدر كوكيه بمنشئ الكوكي القائم نفسه.
  switch (shell.kind) {
    case "teacher": {
      const teacherId = Number(membership.legacyId);
      const teacher = Number.isInteger(teacherId) ? await findTeacherById(teacherId) : null;
      if (!teacher || teacher.deactivatedAt) {
        return Response.json({ error: GENERIC_REFUSAL }, { status: 404 });
      }
      await setSessionCookie(teacher.id);
      return Response.json({ ok: true, kind: "teacher", redirect: shell.home });
    }
    case "student": {
      const key = studentLegacyKey(membership.legacyId);
      const account = key ? await findStudentAccount(key.halaqahId, key.studentId) : null;
      if (!account) return Response.json({ error: GENERIC_REFUSAL }, { status: 404 });
      await setStudentSessionCookie(account.teacherId, account.id);
      return Response.json({ ok: true, kind: "student", redirect: shell.home });
    }
    case "parent": {
      const parentId = Number(membership.legacyId);
      const parent = Number.isInteger(parentId) ? await findParentById(parentId) : null;
      if (!parent) return Response.json({ error: GENERIC_REFUSAL }, { status: 404 });
      await setParentSessionCookie(parent.id);
      return Response.json({ ok: true, kind: "parent", redirect: shell.home });
    }
    case "mosque_admin": {
      const adminId = Number(membership.legacyId);
      const admin = Number.isInteger(adminId) ? await findMosqueAdminById(adminId) : null;
      if (!admin) return Response.json({ error: GENERIC_REFUSAL }, { status: 404 });
      await setMosqueAdminSessionCookie(admin.id);
      return Response.json({ ok: true, kind: "mosque_admin", redirect: shell.home });
    }
    default:
      return Response.json({ error: GENERIC_REFUSAL }, { status: 404 });
  }
}
