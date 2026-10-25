/*
  قواعد الاحتفاظ بالبيانات (ASVS V8.3) — منطق صرف بلا قاعدة بيانات.
  كل قاعدة DELETE ثابت النص (لا مدخلات مستخدم إطلاقاً) ومقيّد بشرط زمني
  دائماً: لا حذف لصف حيّ أو حديث. المنفّذ في lib/retention.ts.

  المُدد:
  - رموز/روابط منتهية (استرجاع، تأكيد بريد، ربط ولي/طالب): بعد يوم من الانتهاء.
  - عدّادات المعدّل ومحاولات الدخول/التسجيل: بعد ٧ أيام (أطول نافذة حدّ ساعة واحدة).
  - طلبات حذف البيانات المبتوت فيها: بعد ١٨٠ يوماً من القرار (المعلّقة لا تُمسّ).
  - أحداث الأمان (security.*) بسجل التدقيق: بعد ١٨٠ يوماً — إجراءات اللوحة الإدارية تبقى.
  - سجل أخطاء الخادم: بعد ٣٠ يوماً.
  - صادر واتساب المُرسَل/المتخطّى/الفاشل: بعد ٩٠ يوماً.
*/

export type RetentionRule = {
  key: string;
  label: string;
  sql: string;
};

export const RETENTION_RULES: readonly RetentionRule[] = [
  {
    key: "password_resets",
    label: "رموز وروابط استرجاع منتهية",
    sql: `DELETE FROM password_resets WHERE expires_at < now() - interval '1 day'`,
  },
  {
    key: "email_verifications",
    label: "روابط تأكيد بريد منتهية",
    sql: `DELETE FROM email_verifications WHERE expires_at < now() - interval '1 day'`,
  },
  {
    key: "parent_link_tokens",
    label: "رموز ربط ولي أمر منتهية",
    sql: `DELETE FROM parent_link_tokens WHERE expires_at < now() - interval '1 day'`,
  },
  {
    key: "student_google_link_tokens",
    label: "رموز ربط جوجل للطالب منتهية",
    sql: `DELETE FROM student_google_link_tokens WHERE expires_at < now() - interval '1 day'`,
  },
  {
    key: "rate_limits",
    label: "عدّادات حدّ المعدّل القديمة",
    sql: `DELETE FROM rate_limits WHERE window_start < now() - interval '7 days'`,
  },
  {
    key: "login_attempts",
    label: "محاولات دخول قديمة",
    sql: `DELETE FROM login_attempts WHERE created_at < now() - interval '7 days'`,
  },
  {
    key: "admin_login_attempts",
    label: "محاولات دخول الأدمن القديمة",
    sql: `DELETE FROM admin_login_attempts WHERE created_at < now() - interval '7 days'`,
  },
  {
    key: "register_attempts",
    label: "محاولات تسجيل قديمة",
    sql: `DELETE FROM register_attempts WHERE created_at < now() - interval '7 days'`,
  },
  {
    key: "invite_attempts",
    label: "محاولات دعوة قديمة",
    sql: `DELETE FROM invite_attempts WHERE created_at < now() - interval '7 days'`,
  },
  {
    key: "link_attempts",
    label: "محاولات ربط قديمة",
    sql: `DELETE FROM link_attempts WHERE created_at < now() - interval '7 days'`,
  },
  {
    key: "student_link_attempts",
    label: "محاولات ربط طالب قديمة",
    sql: `DELETE FROM student_link_attempts WHERE created_at < now() - interval '7 days'`,
  },
  {
    key: "data_deletion_requests",
    label: "طلبات حذف مبتوت فيها منذ ١٨٠ يوماً",
    sql: `DELETE FROM data_deletion_requests WHERE status IN ('done', 'rejected') AND decided_at < now() - interval '180 days'`,
  },
  {
    key: "security_events",
    label: "أحداث أمان أقدم من ١٨٠ يوماً",
    sql: `DELETE FROM dev_audit_log WHERE action LIKE 'security.%' AND at < now() - interval '180 days'`,
  },
  {
    key: "dev_error_log",
    label: "أخطاء خادم أقدم من ٣٠ يوماً",
    sql: `DELETE FROM dev_error_log WHERE at < now() - interval '30 days'`,
  },
  {
    key: "notifications_outbox",
    label: "صادر واتساب منتهٍ أقدم من ٩٠ يوماً",
    sql: `DELETE FROM notifications_outbox WHERE status IN ('sent', 'skipped', 'failed') AND created_at < now() - interval '90 days'`,
  },
];

export type RetentionResult = { key: string; label: string; deleted: number; error?: true };
