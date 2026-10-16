-- دمج المنصة M3 — لوحة المطوّر /dev. إضافي بالكامل وقابل للتشغيل
-- المتكرر: جدولان جديدان فقط، لا DROP ولا تعديل على أي جدول قائم.
--
-- dev_audit_log: كل إجراء إداري حساس من اللوحة (عرض كـ، تفعيل ميزة،
-- إيقاف معلّم، إبطال جلسات، تغيير حساب مدير…) يُسجَّل هنا.
-- dev_error_log: سجل أخطاء الخادم الذي يغذّي قسم «الصحة» — logServerError()
-- في lib/dev-error-log.ts يدرج هنا وينظّف ما تجاوز ٣٠ يوماً بالمعاينة.

CREATE TABLE IF NOT EXISTS dev_audit_log (
  id          SERIAL PRIMARY KEY,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  action      TEXT NOT NULL,
  target_kind TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  details     JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS dev_audit_log_at_idx ON dev_audit_log (at DESC, id DESC);

CREATE TABLE IF NOT EXISTS dev_error_log (
  id         SERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  scope      TEXT NOT NULL,
  message    TEXT NOT NULL,
  stack      TEXT
);

CREATE INDEX IF NOT EXISTS dev_error_log_at_idx ON dev_error_log (at DESC, id DESC);
