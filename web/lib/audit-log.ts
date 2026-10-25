import "server-only";

import { db } from "./db";
import { buildSecurityAuditEntry, type SecurityAuditInput } from "./audit-log-entry";

/*
  سجل أحداث الأمان (ASVS V7) — دخول ناجح/فاشل، دخول الأدمن، استرجاع كلمة
  المرور وتغييرها، وتنظيف الاحتفاظ. يُكتب في جدول التدقيق القائم نفسه
  (dev_audit_log) ببادئة "security." فيظهر بتبويب «أحداث الأمان» في
  /dev/audit دون أن يزاحم إجراءات اللوحة الإدارية (الموافقات، طلبات الحذف،
  «عرض كـ»… تُسجَّل هناك أصلاً بـlogDevAction وبترانزاكشناتها الخاصة).

  - لا أسرار أبداً: مفاتيح details التي تشبه كلمة مرور/رمز/سرّ تُسقط، والمعرّف
    المُدخَل عند الفشل يُخزَّن بصمةً قصيرة لا نصاً (قد يلصق المستخدم كلمة مروره
    في خانة البريد خطأً).
  - الفشل بالتسجيل لا يُفشل الطلب نفسه أبداً (نفس مبدأ logDevAction).
*/

export type { SecurityAuditInput, SecurityEvent } from "./audit-log-entry";

export async function logSecurityEvent(input: SecurityAuditInput): Promise<void> {
  const entry = buildSecurityAuditEntry(input);
  try {
    await db().sql`
      INSERT INTO dev_audit_log (action, target_kind, target_id, details)
      VALUES (${entry.action}, ${entry.targetKind}, ${entry.targetId}, ${JSON.stringify(entry.details)}::jsonb)
    `;
  } catch (error) {
    console.error("audit-log: failed to record security event", entry.action, error);
  }
}
