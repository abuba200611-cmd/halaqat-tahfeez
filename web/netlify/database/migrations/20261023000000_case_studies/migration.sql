-- STEP 65 — دراسة الحالة للطلاب المتعثّرين (خاصة بمعلّمي الحلقة فقط).
-- إضافي بالكامل وقابل للتشغيل المتكرر: لا يلمس أي جدول أو عمود قائم.
--
-- halaqah_id يطابق students(teacher_id, id) (نفس نمط attendance و monthly_plans).
-- حالة واحدة مفتوحة كحدّ أقصى لكل طالب (فهرس فريد جزئي)؛ المغلقة بلا حدّ.
CREATE TABLE IF NOT EXISTS case_studies (
  id          SERIAL      PRIMARY KEY,
  halaqah_id  INTEGER     NOT NULL,
  student_id  TEXT        NOT NULL,
  status      TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ,
  diagnosis   TEXT        NOT NULL DEFAULT '',
  strengths   TEXT        NOT NULL DEFAULT '',
  weaknesses  TEXT        NOT NULL DEFAULT '',
  plan        TEXT        NOT NULL DEFAULT '',
  opened_by   INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_case_studies_one_open
  ON case_studies (halaqah_id, student_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_case_studies_halaqah_status
  ON case_studies (halaqah_id, status, opened_at DESC);

-- سجلّ المتابعة: إجراءات المعلّم ونتائجها.
CREATE TABLE IF NOT EXISTS case_actions (
  id          SERIAL      PRIMARY KEY,
  case_id     INTEGER     NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  action_date TEXT        NOT NULL CHECK (action_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  action      TEXT        NOT NULL,
  result      TEXT,
  created_by  INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_case_actions_case
  ON case_actions (case_id, action_date DESC, id DESC);
