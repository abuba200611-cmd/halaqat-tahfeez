-- سعة الحلقات + قائمة الانتظار + الاستيراد من Excel/CSV. إضافي بالكامل وقابل
-- للتشغيل المتكرر: ADD COLUMN / CREATE TABLE / CREATE INDEX كلها IF NOT EXISTS،
-- بلا تعديل ولا حذف لشيء قائم. الأعمدة الجديدة كلها اختيارية (NULL = بلا قيد).

-- سعة الحلقة ومعايير القبول (كلها اختيارية). لا عمود جنس: نموذج التسجيل لا يجمعه.
ALTER TABLE halaqahs ADD COLUMN IF NOT EXISTS capacity INTEGER
  CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 500);
ALTER TABLE halaqahs ADD COLUMN IF NOT EXISTS min_age SMALLINT
  CHECK (min_age IS NULL OR min_age BETWEEN 3 AND 100);
ALTER TABLE halaqahs ADD COLUMN IF NOT EXISTS max_age SMALLINT
  CHECK (max_age IS NULL OR max_age BETWEEN 3 AND 100);
ALTER TABLE halaqahs ADD COLUMN IF NOT EXISTS level TEXT
  CHECK (level IS NULL OR level IN ('beginner', 'intermediate', 'advanced'));

-- بيانات المطابقة على التسجيل + ترتيب قائمة الانتظار. الحالة الجديدة
-- 'waitlisted' (و'removed' عند إزالة الإدارة) نصّان في عمود status القائم (بلا CHECK).
ALTER TABLE mosque_registrations ADD COLUMN IF NOT EXISTS birth_year SMALLINT;
ALTER TABLE mosque_registrations ADD COLUMN IF NOT EXISTS level TEXT;
ALTER TABLE mosque_registrations ADD COLUMN IF NOT EXISTS waitlist_order INTEGER;
ALTER TABLE mosque_registrations ADD COLUMN IF NOT EXISTS waitlisted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS mosque_registrations_waitlist_idx
  ON mosque_registrations (mosque_id, status, waitlist_order);

-- بيانات الطالب الإضافية من الاستيراد (جوال، جوال ولي الأمر، سنة الميلاد، ملاحظات).
-- جدول مستقل حتى لا يُعدَّل جدول students؛ (halaqah_id, student_id) يطابق
-- students(teacher_id, id) ويُحذف تلقائياً مع الطالب.
CREATE TABLE IF NOT EXISTS student_profiles (
  halaqah_id   INTEGER     NOT NULL,
  student_id   TEXT        NOT NULL,
  phone        TEXT        NOT NULL DEFAULT '',
  parent_phone TEXT        NOT NULL DEFAULT '',
  birth_year   SMALLINT,
  notes        TEXT        NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (halaqah_id, student_id),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

-- سجل نشاط التسجيل الآلي (توزيع آلي، انتظار، ترقية من الانتظار) يراه مدير الجامع.
CREATE TABLE IF NOT EXISTS enrollment_activity (
  id              SERIAL      PRIMARY KEY,
  mosque_id       INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  kind            TEXT        NOT NULL,
  registration_id INTEGER,
  halaqah_id      INTEGER,
  message         TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS enrollment_activity_mosque_idx
  ON enrollment_activity (mosque_id, created_at DESC);
