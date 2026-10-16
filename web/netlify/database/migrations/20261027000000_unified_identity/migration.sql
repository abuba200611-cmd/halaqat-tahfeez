-- دمج المنصة M5 — الهوية الموحّدة: users + memberships فوق الحسابات القديمة.
-- إضافي بالكامل وقابل للتشغيل المتكرر: CREATE IF NOT EXISTS، والـbackfill كله
-- INSERT ... SELECT ... ON CONFLICT DO NOTHING (يضيف صفوفاً فقط، لا يعدّل ولا
-- يحذف شيئاً في أي جدول قائم). جداول الدخول القديمة وكلمات المرور والكوكيز
-- تبقى مصدر الحقيقة للتوثيق — لا لمسة لها هنا إطلاقاً.
--
-- قواعد المطابقة نفسها حرفياً في web/lib/identity-mapping.ts (العقد المُختبَر):
--   معلّم     → users.email = lower(teachers.username) (عمود username يحمل بريداً)
--   ولي أمر   → users.email = lower(parents.email)
--   مدير جامع → users.username = mosque_admins.username (ليس بريداً بالضرورة)
--   طالب     → users.username = students.username، أو مقبض اصطناعي
--              "student:halaqahId:studentId" لطالب بلا اسم مستخدم
--   مشرف عام  → عضوية developer من super_admins (الجدول قد يكون فارغاً)
-- البريد نفسه معلّماً وولي أمر = مستخدم ONE بعضويتين: ولد المستخدم في مسار
-- المعلّمين أولاً، ومسار الأولياء يعيد استخدامه بـON CONFLICT (email) DO NOTHING.
-- إعادة التشغيل آمنة: كل مسار يتخطى الصفوف القديمة التي لها عضوية أصلاً
-- (NOT EXISTS على المفتاح legacy_kind + legacy_id + role + student_id).

-- ————— الجدولان —————

-- شخص واحد قد يملك عدة أدوار: بريد فريد بحروف صغيرة (أو NULL)، واسم مستخدم
-- اختياري (فريد عملياً بمصادره، لا يُقيَّد هنا)، والاسم للعرض فقط.
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  display_name TEXT NOT NULL,
  email       TEXT UNIQUE CHECK (email IS NULL OR email = lower(email)),
  username    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- عضوية الشخص بدور واحد نحو جامع/حلقة/طالب. legacy_kind + legacy_id يشيران
-- للصف القديم (teachers.id / parents.id / mosque_admins.id / مفتاح students
-- المركّب "teacher_id:id" / super_admins.id) — الجداول القديمة تظل مصدر
-- التوثيق، وهذا الجدول خريطة أدوار فقط. لا FK لـmosque_id/halaqah_id/
-- student_id عمداً: students تُستبدل صفوفها (replaceStudents) ولا يجب أن
-- تعطّل ذلك، وأعمدة الجامع/الحلقة للتسمية والتصفية لا للإسناد المرجعي.
CREATE TABLE IF NOT EXISTS memberships (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('developer', 'mosque_admin', 'supervisor', 'assistant', 'student', 'parent')),
  mosque_id   INTEGER,
  halaqah_id  INTEGER,
  student_id  TEXT,
  legacy_kind TEXT NOT NULL,
  legacy_id   TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (legacy_kind, legacy_id, role, student_id)
);

CREATE INDEX IF NOT EXISTS memberships_user_active_idx ON memberships (user_id) WHERE active;

-- ————— backfill: المعلّمون أولاً (ينشئون مستخدمي البريد الذي يعيد استخدامه الأولياء) —————

WITH missing AS (
  SELECT t.id, t.role, t.halaqah_id, lower(t.username) AS email,
         COALESCE(NULLIF(TRIM(t.teacher_name), ''), t.username) AS display_name,
         (t.deactivated_at IS NULL) AS active,
         h.mosque_id
  FROM teachers t
  LEFT JOIN halaqahs h ON h.id = t.halaqah_id
  WHERE NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.legacy_kind = 'teacher' AND m.legacy_id = t.id::text AND m.role = t.role
  )
), inserted_users AS (
  INSERT INTO users (display_name, email, username)
  SELECT display_name, email, NULL FROM missing
  ON CONFLICT (email) DO NOTHING
  RETURNING id, email
)
INSERT INTO memberships (user_id, role, mosque_id, halaqah_id, student_id, legacy_kind, legacy_id, active)
SELECT COALESCE(iu.id, eu.id), ms.role, ms.mosque_id, ms.halaqah_id, NULL, 'teacher', ms.id::text, ms.active
FROM missing ms
LEFT JOIN inserted_users iu ON iu.email = ms.email
LEFT JOIN users eu ON eu.email = ms.email
ON CONFLICT DO NOTHING;

-- ————— backfill: أولياء الأمور (بريد مطابق لمعلّم = نفس المستخدم بعضوية ثانية) —————

WITH missing AS (
  SELECT p.id, lower(p.email) AS email,
         COALESCE(NULLIF(TRIM(p.name), ''), lower(p.email)) AS display_name
  FROM parents p
  WHERE NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.legacy_kind = 'parent' AND m.legacy_id = p.id::text AND m.role = 'parent'
  )
), inserted_users AS (
  INSERT INTO users (display_name, email, username)
  SELECT display_name, email, NULL FROM missing
  ON CONFLICT (email) DO NOTHING
  RETURNING id, email
)
INSERT INTO memberships (user_id, role, mosque_id, halaqah_id, student_id, legacy_kind, legacy_id, active)
SELECT COALESCE(iu.id, eu.id), 'parent', NULL, NULL, NULL, 'parent', ms.id::text, TRUE
FROM missing ms
LEFT JOIN inserted_users iu ON iu.email = ms.email
LEFT JOIN users eu ON eu.email = ms.email
ON CONFLICT DO NOTHING;

-- ————— backfill: مدراء الجوامع —————

WITH missing AS (
  SELECT a.id, a.mosque_id, lower(a.username) AS handle
  FROM mosque_admins a
  WHERE NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.legacy_kind = 'mosque_admin' AND m.legacy_id = a.id::text AND m.role = 'mosque_admin'
  )
), inserted_users AS (
  INSERT INTO users (display_name, email, username)
  SELECT handle, NULL, handle FROM missing
  ON CONFLICT (email) DO NOTHING
  RETURNING id, username
)
INSERT INTO memberships (user_id, role, mosque_id, halaqah_id, student_id, legacy_kind, legacy_id, active)
SELECT iu.id, 'mosque_admin', ms.mosque_id, NULL, NULL, 'mosque_admin', ms.id::text, TRUE
FROM missing ms
JOIN inserted_users iu ON iu.username = ms.handle
ON CONFLICT DO NOTHING;

-- ————— backfill: الطلاب (غير المحذوفين؛ بلا اسم مستخدم يُنشأ لهم مقبض اصطناعي فريد) —————

WITH missing AS (
  SELECT s.teacher_id AS halaqah_id, s.id AS student_id,
         COALESCE(NULLIF(TRIM(s.username), ''), 'student:' || s.teacher_id || ':' || s.id) AS handle,
         s.name, s.active, h.mosque_id
  FROM students s
  LEFT JOIN halaqahs h ON h.id = s.teacher_id
  WHERE s.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.legacy_kind = 'student'
        AND m.legacy_id = (s.teacher_id || ':' || s.id)
        AND m.role = 'student'
    )
), inserted_users AS (
  INSERT INTO users (display_name, email, username)
  SELECT name, NULL, handle FROM missing
  ON CONFLICT (email) DO NOTHING
  RETURNING id, username
)
INSERT INTO memberships (user_id, role, mosque_id, halaqah_id, student_id, legacy_kind, legacy_id, active)
SELECT iu.id, 'student', ms.mosque_id, ms.halaqah_id, ms.student_id, 'student',
       ms.halaqah_id || ':' || ms.student_id, ms.active
FROM missing ms
JOIN inserted_users iu ON iu.username = ms.handle
ON CONFLICT DO NOTHING;

-- ————— backfill: المشرفون العامّون → عضوية developer (الجدول فارغ غالباً فلا أثر) —————

WITH missing AS (
  SELECT sa.id, lower(sa.username) AS handle
  FROM super_admins sa
  WHERE NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.legacy_kind = 'super_admin' AND m.legacy_id = sa.id::text AND m.role = 'developer'
  )
), inserted_users AS (
  INSERT INTO users (display_name, email, username)
  SELECT handle, NULL, handle FROM missing
  ON CONFLICT (email) DO NOTHING
  RETURNING id, username
)
INSERT INTO memberships (user_id, role, mosque_id, halaqah_id, student_id, legacy_kind, legacy_id, active)
SELECT iu.id, 'developer', NULL, NULL, NULL, 'super_admin', ms.id::text, TRUE
FROM missing ms
JOIN inserted_users iu ON iu.username = ms.handle
ON CONFLICT DO NOTHING;
