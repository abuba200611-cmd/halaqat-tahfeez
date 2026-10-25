import "server-only";

import { db } from "@/lib/db";
import { logServerError } from "@/lib/dev-error-log";
import { PRIVACY_POLICY_VERSION } from "@/lib/privacy-consent-shared";

export type ConsentSubjectKind = "teacher" | "parent" | "student" | "mosque_request" | "association_request";

/**
 * يخزّن موافقة السياسة بطابع زمني (privacy_consents). idempotent لكل
 * (النوع، المعرّف). لا يُفشل التسجيل نفسه إن تعذّر الحفظ (الحساب أُنشئ بعد
 * التحقق من الموافقة فعلاً) لكن الفشل يُسجَّل لمراجعة المطوّر.
 */
export async function recordPrivacyConsent(
  kind: ConsentSubjectKind,
  ref: string | number,
  ip: string,
): Promise<void> {
  try {
    await db().sql`
      INSERT INTO privacy_consents (subject_kind, subject_ref, policy_version, ip)
      VALUES (${kind}, ${String(ref)}, ${PRIVACY_POLICY_VERSION}, ${ip})
      ON CONFLICT (subject_kind, subject_ref) DO NOTHING
    `;
  } catch (error) {
    try {
      await logServerError("privacy-consent", error);
    } catch {
      // التسجيل نفسه لا يتعطّل بسبب سجل الأخطاء
    }
  }
}
