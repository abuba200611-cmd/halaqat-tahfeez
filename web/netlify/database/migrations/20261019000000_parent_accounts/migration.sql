-- STEP 61 — حسابات أولياء الأمور (قراءة فقط لمتابعة الأبناء).
-- إضافي بالكامل وقابل للتشغيل المتكرر: لا يلمس أي جدول أو عمود قائم.
--
-- ملاحظة: عمودا halaqah_id وstudent_id هنا يطابقان students(teacher_id, id)
-- (teacher_id يحمل معرّف الحلقة منذ تعدّد المعلّمين، وid من نوع TEXT)،
-- وبنفس نمط student_push_subscriptions / student_google_link_tokens.

-- حساب ولي الأمر — مستقل تماماً عن teachers وعن حسابات الطلاب.
CREATE TABLE IF NOT EXISTS parents (
  id              SERIAL      PRIMARY KEY,
  email           TEXT        NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash   TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  session_version INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ربط ولي أمر بطالب: ولي واحد بأبناء كثيرين (عبر حلقات مختلفة)،
-- وطالب واحد بعدّة أولياء.
CREATE TABLE IF NOT EXISTS parent_children (
  parent_id  INTEGER     NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  halaqah_id INTEGER     NOT NULL,
  student_id TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (parent_id, halaqah_id, student_id),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parent_children_student
  ON parent_children (halaqah_id, student_id);

-- رمز دعوة لمرة واحدة (صلاحية ٧ أيام يضبطها الكود) — يُخزَّن SHA-256
-- للرمز فقط، والرمز الخام لا يُحفظ أبداً.
CREATE TABLE IF NOT EXISTS parent_link_tokens (
  token_hash TEXT        PRIMARY KEY,
  halaqah_id INTEGER     NOT NULL,
  student_id TEXT        NOT NULL,
  created_by TEXT        NOT NULL CHECK (created_by IN ('teacher', 'student')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_parent_link_tokens_student
  ON parent_link_tokens (halaqah_id, student_id);

-- اشتراكات إشعارات ولي الأمر (Web Push) — بمعزل عن push_subscriptions
-- (المعلّم) وstudent_push_subscriptions (الطالب).
CREATE TABLE IF NOT EXISTS parent_push_subscriptions (
  id              SERIAL      PRIMARY KEY,
  parent_id       INTEGER     NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  endpoint        TEXT        NOT NULL UNIQUE,
  p256dh          TEXT        NOT NULL,
  auth            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_parent_push_subscriptions_parent
  ON parent_push_subscriptions (parent_id);
