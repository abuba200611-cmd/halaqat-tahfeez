-- الاختبارات والشهادات (امتثال الجمعيات A1) — إضافي بالكامل وقابل للتشغيل
-- المتكرر: CREATE IF NOT EXISTS فقط، لا DROP ولا تعديل بيانات ولا لمس أي
-- جدول قائم.
--
-- الكيانات:
--   exam_types            أنواع اختبارات كل جامع (جزء/خمسة/عشرة/ختم) بقواعد
--                         درجاتها وخصوماتها — تُبذَر افتراضياً عند أول استخدام.
--   exam_sessions         جلسة اختبار بتاريخ ومقر ولجنة (معلّمو الجامع وأعضاؤه).
--   exam_session_members  لجنة الجلسة: 'teacher' يشير إلى teachers، و'member'
--                         إلى mosque_members — ربط متعدد الأشكال بلا FK كعرف
--                         family_members/committee_members.
--   exam_nominations      ترشيح معلّم طالباً (من حلقة بهذا الجامع) لنوع اختبار.
--   exam_results          نتيجة مسجَّلة من الممتحن، بتفصيل الأخطاء، تُنشر
--                         (published_at) فيراها الطالب وولي الأمر مع إشعار.
--   certificates          الشهادات الصادرة (اختبار/خدمة معلّم/تعريف طالب) برمز
--                         تحقق فريد لصفحة /verify/[code] العامة.
--
-- كل رقم/قاعدة قابلة للضبط لكل جامع عبر config لميزة "exams" بجدول
-- mosque_features القائم (عمود config JSONB موجود أصلاً) — القيم الافتراضية
-- بالكود (lib/mosque/exams.ts). طالب الاختبار هو طالب حقيقي من جدول students
-- (halaqah_id + student_id — عمود teacher_id فيه هو معرّف الحلقة).

-- ————— أنواع الاختبارات —————

CREATE TABLE IF NOT EXISTS exam_types (
  id         SERIAL PRIMARY KEY,
  mosque_id  INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  -- عدد أجزاء الاختبار (١ جزء، ٥، ١٠، ٣٠ للختم) — نطاق الأجزاء الفعلي
  -- يُحدَّد عند كل ترشيح (juz_from..juz_to) وطوله يساوي هذا العدد
  juz_count  INTEGER NOT NULL DEFAULT 1 CHECK (juz_count BETWEEN 1 AND 30),
  max_score  INTEGER NOT NULL DEFAULT 100 CHECK (max_score BETWEEN 1 AND 1000),
  pass_mark  INTEGER NOT NULL DEFAULT 60 CHECK (pass_mark BETWEEN 1 AND 1000),
  CHECK (pass_mark <= max_score),
  -- خصم نقاط كل خطأ {'jali','khafi','taraddud','nisyan'}؛ '{}' = افتراضيات
  -- إعدادات الجامع (كل جامع يضبط أرقامه)
  error_rules JSONB NOT NULL DEFAULT '{}',
  active     BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mosque_id, name)
);

-- ————— الجلسات ولجانها —————

CREATE TABLE IF NOT EXISTS exam_sessions (
  id           SERIAL PRIMARY KEY,
  mosque_id    INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  exam_type_id INTEGER NOT NULL REFERENCES exam_types(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  location     TEXT NOT NULL DEFAULT '',
  notes        TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'closed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exam_sessions_mosque_idx
  ON exam_sessions (mosque_id, session_date DESC, id DESC);

CREATE TABLE IF NOT EXISTS exam_session_members (
  id          SERIAL PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  member_kind TEXT NOT NULL CHECK (member_kind IN ('teacher', 'member')),
  member_id   INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, member_kind, member_id)
);

-- ————— الترشيحات —————

CREATE TABLE IF NOT EXISTS exam_nominations (
  id           SERIAL PRIMARY KEY,
  mosque_id    INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  exam_type_id INTEGER NOT NULL REFERENCES exam_types(id) ON DELETE CASCADE,
  halaqah_id   INTEGER NOT NULL REFERENCES halaqahs(id) ON DELETE CASCADE,
  student_id   TEXT NOT NULL,
  juz_from     INTEGER NOT NULL CHECK (juz_from BETWEEN 1 AND 30),
  juz_to       INTEGER NOT NULL CHECK (juz_to BETWEEN 1 AND 30),
  CHECK (juz_from <= juz_to),
  nominated_by INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  session_id   INTEGER REFERENCES exam_sessions(id) ON DELETE SET NULL,
  -- pending ثم scheduled بالجدولة، ثم done عند تسجيل النتيجة، وwithdrawn
  -- عند سحب الترشيح قبلها
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'done', 'withdrawn')),
  note         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS exam_nominations_mosque_idx
  ON exam_nominations (mosque_id, created_at DESC);
CREATE INDEX IF NOT EXISTS exam_nominations_session_idx
  ON exam_nominations (session_id);

-- منع تكرار الترشيح النشط نفسه (طالب، نوع، نطاق) — فهرس فريد جزئي حتى
-- يبقى إعادة الترشيح بعد نتيجة/سحب ممكناً (إعادة محاولة بعد رسوب مثلاً)
CREATE UNIQUE INDEX IF NOT EXISTS exam_nominations_active_unique
  ON exam_nominations (halaqah_id, student_id, exam_type_id, juz_from, juz_to)
  WHERE status IN ('pending', 'scheduled');

-- ————— النتائج —————

CREATE TABLE IF NOT EXISTS exam_results (
  id            SERIAL PRIMARY KEY,
  mosque_id     INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  nomination_id INTEGER NOT NULL UNIQUE REFERENCES exam_nominations(id) ON DELETE CASCADE,
  session_id    INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  halaqah_id    INTEGER NOT NULL,
  student_id    TEXT NOT NULL,
  juz_from      INTEGER NOT NULL CHECK (juz_from BETWEEN 1 AND 30),
  juz_to        INTEGER NOT NULL CHECK (juz_to BETWEEN 1 AND 30),
  -- لقطة قواعد النوع وقت التسجيل: لا تتغير النتيجة إن عُدّل النوع لاحقاً
  max_score     INTEGER NOT NULL CHECK (max_score BETWEEN 1 AND 1000),
  pass_mark     INTEGER NOT NULL CHECK (pass_mark BETWEEN 1 AND 1000),
  errors        JSONB NOT NULL DEFAULT '{}',
  score         INTEGER NOT NULL CHECK (score >= 0),
  passed        BOOLEAN NOT NULL,
  examiner_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  notes         TEXT NOT NULL DEFAULT '',
  -- null = مسوّدة يراها الممتحن والإدارة فقط؛ النشر يظهرها للطالب وولي الأمر
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS exam_results_student_idx
  ON exam_results (halaqah_id, student_id, published_at DESC);
CREATE INDEX IF NOT EXISTS exam_results_mosque_session_idx
  ON exam_results (mosque_id, session_id);

-- ————— الشهادات —————

CREATE TABLE IF NOT EXISTS certificates (
  id         SERIAL PRIMARY KEY,
  mosque_id  INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('student_exam', 'teacher_service', 'student_enrollment')),
  -- لقطة اسم حامل الشهادة وعنوان الإنجاز — تبقى صالحة ولو حُذف الأصل
  holder_name TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT '',
  result_id   INTEGER REFERENCES exam_results(id) ON DELETE SET NULL,
  teacher_id  INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  halaqah_id  INTEGER,
  student_id  TEXT,
  -- بيانات إضافية حسب النوع (اسم النوع، الفترة، السنة الدراسية…)
  payload     JSONB NOT NULL DEFAULT '{}',
  issued_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS certificates_mosque_idx
  ON certificates (mosque_id, created_at DESC);
