-- dev split + البلاغات من كل الأدوار + نشاط الحسابات.
-- إضافي بالكامل وقابل للتشغيل المتكرر: لا DROP ولا تعديل على أي عمود قائم،
-- وجداول جديدة فقط + أعمدة بADD COLUMN IF NOT EXISTS.
--
-- ١) نشاط الحسابات: آخر دخول وآخر ظهور لكل نوع حساب (الطلاب بلا created_at
--    أصلاً فتُضاف — صفوف قائمة تبقى NULL فتُستثنى من عدّ "حسابات جديدة"،
--    وهو الصحيح: تاريخ إنشائها غير معروف).
-- ٢) البلاغات: جدول reports لأولياء الأمور ومدراء الجوامع (المعلّم في
--    suggestions والطالب في student_suggestions يبقيان كما هما — عمود
--    status يُضاف للثلاثة)، والمرفقات تمتد بعمود report_id.

ALTER TABLE teachers     ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE teachers     ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;
ALTER TABLE students     ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE students     ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;
ALTER TABLE students     ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ;
ALTER TABLE parents      ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE parents      ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;
ALTER TABLE mosque_admins ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE mosque_admins ADD COLUMN IF NOT EXISTS last_seen_at  TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS reports (
  id            SERIAL      PRIMARY KEY,
  -- لا FK لreporter_id عمداً: المعرّف يُفسَّر حسب reporter_kind (parents.id
  -- أو mosque_admins.id) — قيد شرطي بين جدولين غير ممكن بPostgres
  reporter_kind TEXT        NOT NULL CHECK (reporter_kind IN ('parent', 'mosque_admin')),
  reporter_id   INTEGER     NOT NULL,
  type          TEXT        NOT NULL DEFAULT 'suggestion' CHECK (type IN ('suggestion', 'problem')),
  message       TEXT        NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  status        TEXT        NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'seen', 'done')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON reports (created_at DESC);

ALTER TABLE suggestion_attachments
  ADD COLUMN IF NOT EXISTS report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_suggestion_attachments_report
  ON suggestion_attachments (report_id) WHERE report_id IS NOT NULL;

ALTER TABLE suggestions         ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE student_suggestions ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';

-- قيود CHECK على عمودي status المضافَين (ADD CONSTRAINT بلا IF NOT EXISTS
-- بPostgres — نفس نمط DO $$ بالترحيل 20261029000000)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'suggestions'::regclass
      AND conname = 'suggestions_status_check'
  ) THEN
    ALTER TABLE suggestions
      ADD CONSTRAINT suggestions_status_check CHECK (status IN ('new', 'seen', 'done'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'student_suggestions'::regclass
      AND conname = 'student_suggestions_status_check'
  ) THEN
    ALTER TABLE student_suggestions
      ADD CONSTRAINT student_suggestions_status_check CHECK (status IN ('new', 'seen', 'done'));
  END IF;
END
$$;
