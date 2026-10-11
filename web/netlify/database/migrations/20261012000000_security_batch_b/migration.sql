-- الدفعة الأمنية ب: نسخة جلسة لكل حساب (إبطال فوري لكل الجلسات عند تغيير كلمة المرور)
-- وعدّادات معدّل عامة ذرّية. إضافي فقط وقابل للتشغيل المتكرر.

ALTER TABLE teachers ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT        NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
