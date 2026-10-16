-- دمج المنصة M1 — مخطط نظام الجامع (masjid-idara) فوق قاعدة الحلقات.
-- إضافي بالكامل وقابل للتشغيل المتكرر: CREATE IF NOT EXISTS / ADD COLUMN
-- IF NOT EXISTS فقط — لا DROP ولا تعديل بيانات ولا لمس أي جدول قائم.
--
-- الجداول المشتركة أصلاً بهذه القاعدة تُعاد لا تُستنسخ:
--   mosques, mosque_admins       (خطوة MVP foundation ١) — نضيف هنا فقط
--                               ما ينقصها من أعمدة/قيود نظام الجامع.
--   halaqahs                    الحقيقية — حلقات نظام الجامع "الروابط"
--                               تُطابَق عليها برمز الدعوة (سكربت النقل)
--                               فتصبح halaqahs.mosque_id محدَّداً، بلا جدول جديد.
--
-- pending_students تصبح mosque_registrations (نفس الأعمدة والقيود، و
-- halaqah_id يشير الآن إلى halaqahs الحقيقية). بقية جداول نظام الجامع
-- تُنشأ بأسمائها وأعمدتها وقيودها نفسها، وكل FK يشير لجداول هذه القاعدة.
-- الروابط متعددة الأشكال (member_kind/target_kind/tag_kind) تبقى بلا FK
-- كما في الأصل: 'student' يشير إلى mosque_registrations (كان
-- pending_students)، و'member' إلى mosque_members، و'halaqah' إلى
-- halaqahs الحقيقية.

-- ————— ما ينقص mosques و mosque_admins عن نسخة نظام الجامع —————

-- رمز انضمام المعلّمين لكل جامع (nullable، يُولَّد كسولاً)
ALTER TABLE mosques ADD COLUMN IF NOT EXISTS teacher_join_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS mosques_teacher_join_code_key
  ON mosques (teacher_join_code);

-- جامع واحد = مدير واحد: نسخة نظام الجامع تقيد mosque_id بـ UNIQUE
-- (upsert المدير يعتمد عليه بـ ON CONFLICT (mosque_id)).
-- يُنشأ فقط إن لم توجد تكرارات في البيانات الحالية (وإلا يفشل الترحيل).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM mosque_admins GROUP BY mosque_id HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS mosque_admins_mosque_id_key
      ON mosque_admins (mosque_id);
  END IF;
END $$;

-- ————— خريطة المعرّفات لسكربت النقل (web/scripts/merge-masjid-data.mjs) —————
-- كل صف منقول يسجَّل هنا، فتكرار السكربب يتخطى ما نُقل سابقاً.
CREATE TABLE IF NOT EXISTS merge_id_map (
  source_table TEXT   NOT NULL,
  source_id    INTEGER NOT NULL,
  target_id    INTEGER NOT NULL,
  PRIMARY KEY (source_table, source_id)
);

-- ————— تسجيلات الجامع (كانت pending_students) —————

-- طالب سجّل اهتمامه عبر رابط التسجيل العام، بانتظار التوزيع على حلقة
-- حقيقية من halaqahs هذه القاعدة.
CREATE TABLE IF NOT EXISTS mosque_registrations (
  id           SERIAL PRIMARY KEY,
  mosque_id    INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'assigned'
  halaqah_id   INTEGER REFERENCES halaqahs(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at  TIMESTAMPTZ
);

-- ————— المزايا والدماغ —————

-- تجاوزات مزايا كل جامع (غياب الصف = القيمة الافتراضية بالكود)
CREATE TABLE IF NOT EXISTS mosque_features (
  mosque_id    INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  feature_key  TEXT NOT NULL,
  enabled      BOOLEAN NOT NULL,
  config       JSONB NOT NULL DEFAULT '{}',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mosque_id, feature_key)
);

-- ملاحظات دماغ الجامع ([[وصلات]] بالعناوين أو السَلَغ، لا جدول حواف)
CREATE TABLE IF NOT EXISTS brain_notes (
  id         SERIAL PRIMARY KEY,
  mosque_id  INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  tags       TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mosque_id, slug)
);

-- ————— الأفراد والأسر واللجان —————

-- أعضاء بالاسم الحر (غير الطلاب) — للأسر واللجان
CREATE TABLE IF NOT EXISTS mosque_members (
  id         SERIAL PRIMARY KEY,
  mosque_id  INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL DEFAULT '',
  role_note  TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- أسر الجامع
CREATE TABLE IF NOT EXISTS families (
  id          SERIAL PRIMARY KEY,
  mosque_id   INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  leader_name TEXT NOT NULL DEFAULT '',
  notes       TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- أفراد الأسرة: 'student' يشير إلى mosque_registrations، و'member' إلى
-- mosque_members — ربط متعدد الأشكال بلا FK كما في الأصل
CREATE TABLE IF NOT EXISTS family_members (
  id          SERIAL PRIMARY KEY,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_kind TEXT NOT NULL CHECK (member_kind IN ('student', 'member')),
  member_id   INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, member_kind, member_id)
);

-- لجان الجامع
CREATE TABLE IF NOT EXISTS committees (
  id          SERIAL PRIMARY KEY,
  mosque_id   INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- أعضاء اللجنة بدور نصي حر (رئيس/عضو/أمين سر…)
CREATE TABLE IF NOT EXISTS committee_members (
  id           SERIAL PRIMARY KEY,
  committee_id INTEGER NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  member_kind  TEXT NOT NULL CHECK (member_kind IN ('student', 'member')),
  member_id    INTEGER NOT NULL,
  role         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (committee_id, member_kind, member_id)
);

-- مهام اللجنة — لوحة ثلاث أعمدة (todo/doing/done)
CREATE TABLE IF NOT EXISTS committee_tasks (
  id           SERIAL PRIMARY KEY,
  committee_id INTEGER NOT NULL REFERENCES committees(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  due_date     DATE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ————— التقييم الأسبوعي —————

-- معايير التقييم التي يحددها كل جامع بنفسه
CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id         SERIAL PRIMARY KEY,
  mosque_id  INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  max_score  INTEGER NOT NULL DEFAULT 10 CHECK (max_score BETWEEN 1 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mosque_id, name)
);

-- درجات الأسبوع: هدفه أسرة أو طالب (mosque_registrations)، والمعيار من
-- معايير الجامع نفسه. UNIQUE يجعل الحفظ upsert.
CREATE TABLE IF NOT EXISTS evaluations (
  id           SERIAL PRIMARY KEY,
  mosque_id    INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,
  target_kind  TEXT NOT NULL CHECK (target_kind IN ('family', 'student')),
  target_id    INTEGER NOT NULL,
  criterion_id INTEGER NOT NULL REFERENCES evaluation_criteria(id) ON DELETE CASCADE,
  score        INTEGER NOT NULL CHECK (score >= 0),
  note         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, target_kind, target_id, criterion_id)
);

CREATE INDEX IF NOT EXISTS evaluations_week_idx
  ON evaluations (mosque_id, week_start, target_kind);

-- ————— أرشيف الأنشطة —————

-- الوسم (tag_kind + tag_id) متعدد الأشكال بلا FK: 'halaqah' يشير إلى
-- halaqahs الحقيقية، و'family'/'committee' إلى جدوليهما هنا
CREATE TABLE IF NOT EXISTS activities (
  id            SERIAL PRIMARY KEY,
  mosque_id     INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  tag_kind      TEXT CHECK (tag_kind IN ('halaqah', 'family', 'committee')),
  tag_id        INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((tag_kind IS NULL) = (tag_id IS NULL))
);

CREATE INDEX IF NOT EXISTS activities_mosque_date_idx
  ON activities (mosque_id, activity_date DESC, id DESC);

-- صور (BYTEA مضغوطة من المتصفح) وروابط فيديو
CREATE TABLE IF NOT EXISTS activity_media (
  id          SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  mosque_id   INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('photo', 'video_link')),
  mime        TEXT,
  bytes       BYTEA,
  size_bytes  INTEGER,
  url         TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (kind = 'photo' AND mime IS NOT NULL AND bytes IS NOT NULL AND size_bytes IS NOT NULL AND url IS NULL)
    OR
    (kind = 'video_link' AND url IS NOT NULL AND bytes IS NULL AND mime IS NULL AND size_bytes IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS activity_media_activity_idx
  ON activity_media (activity_id, sort_order, id);
CREATE INDEX IF NOT EXISTS activity_media_mosque_kind_idx
  ON activity_media (mosque_id, kind);

-- ————— الأوسمة —————

-- أوسمة الجامع (تعريف واحد لكل جامع، يُمنح لأهداف متعددة)
CREATE TABLE IF NOT EXISTS badges (
  id            SERIAL PRIMARY KEY,
  mosque_id     INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  icon          TEXT NOT NULL DEFAULT '🏅',
  description   TEXT NOT NULL DEFAULT '',
  criteria_note TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mosque_id, name)
);

-- منح الأوسمة: الهدف طالب (mosque_registrations) أو أسرة أو عضو حر —
-- ربط متعدد الأشكال بلا FK. UNIQUE: منح الوسام نفسه للهدف نفسه مرة
-- واحدة في اليوم فقط.
CREATE TABLE IF NOT EXISTS badge_awards (
  id          SERIAL PRIMARY KEY,
  badge_id    INTEGER NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  mosque_id   INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('student', 'family', 'member')),
  target_id   INTEGER NOT NULL,
  awarded_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (badge_id, target_kind, target_id, awarded_at)
);

CREATE INDEX IF NOT EXISTS badge_awards_mosque_date_idx
  ON badge_awards (mosque_id, awarded_at DESC);

-- ————— الجدول الأسبوعي —————

-- فترة (day_of_week × period) × خانة وقت/عنوان. ref_id يشير إلى حلقة
-- (halaqahs الحقيقية) أو أسرة/لجنة من الجامع نفسه (يُتحقق بالتطبيق)
-- أو NULL للبرامج الحرة.
CREATE TABLE IF NOT EXISTS schedule_slots (
  id           SERIAL PRIMARY KEY,
  mosque_id    INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  day_of_week  INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  period       TEXT NOT NULL CHECK (period IN ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'other')),
  start_time   TEXT CHECK (start_time IS NULL OR start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  title        TEXT NOT NULL,
  program_kind TEXT NOT NULL DEFAULT 'other' CHECK (program_kind IN ('halaqah', 'family', 'committee', 'lecture', 'sport', 'cultural', 'other')),
  ref_id       INTEGER,
  location     TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_slots_week_idx
  ON schedule_slots (mosque_id, day_of_week, period);
