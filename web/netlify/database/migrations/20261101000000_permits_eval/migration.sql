-- A3 — تصاريح الحلقات، تقييم المعلّم والحوافز، ومستوى الجمعية.
-- إضافي بالكامل وقابل للتشغيل المتكرر: CREATE/ADD COLUMN IF NOT EXISTS فقط،
-- ولا تعديل لبيانات قائمة ولا حذف. الاستثناء الوحيد توسيع قيد CHECK لعمود
-- memberships.role بقيمة جديدة (يُنفَّذ مرة واحدة فقط ويُتخطّى إن كانت القيمة موجودة).
--
-- الأرقام والمعايير لا تُخزَّن هنا: كلها إعدادات لكل جامع في mosque_settings
-- (مفتاحا "permits" و"teacher_eval") بافتراضيات بالكود (lib/permits.ts،
-- lib/teacher-eval.ts). المخزَّن هنا السجلات والحالات فقط.

-- ————— تصاريح الحلقات —————

-- تصريح واحد لكل (حلقة، عام دراسي هجري). status:
--   active | suspended | withdrawn | pending_renewal
-- suspensions_count يعدّ مرات الإيقاف داخل هذا العام. كل تغيير يدوي
-- ويُسجَّل في permits_log.
CREATE TABLE IF NOT EXISTS halaqah_permits (
  id                SERIAL      PRIMARY KEY,
  halaqah_id        INTEGER     NOT NULL REFERENCES halaqahs(id) ON DELETE CASCADE,
  academic_year     INTEGER     NOT NULL CHECK (academic_year BETWEEN 1300 AND 1600),
  status            TEXT        NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'suspended', 'withdrawn', 'pending_renewal')),
  issued_at         DATE,
  renewal_due       DATE,
  suspensions_count INTEGER     NOT NULL DEFAULT 0 CHECK (suspensions_count >= 0),
  notes             TEXT        NOT NULL DEFAULT '',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (halaqah_id, academic_year)
);

CREATE INDEX IF NOT EXISTS halaqah_permits_year_idx ON halaqah_permits (academic_year, status);

-- سجل تدقيق التصاريح: كل إجراء يدوي (حتى طلب الترقية على مستوى الجامع
-- حيث halaqah_id فارغ). actor_kind = mosque_admin | developer.
CREATE TABLE IF NOT EXISTS permits_log (
  id          SERIAL      PRIMARY KEY,
  mosque_id   INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  halaqah_id  INTEGER     REFERENCES halaqahs(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  actor_kind  TEXT        NOT NULL,
  actor_id    INTEGER,
  details     JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS permits_log_mosque_idx ON permits_log (mosque_id, created_at DESC, id DESC);

-- ————— تقييم المعلّم —————

-- تقييم واحد لكل (معلّم، فترة). period: '1448' للعام، '1448-T1'/'1448-T2'
-- للفصلين. scores = {مفتاح المعيار: ٠..١٠٠ أو null}. indicators = لقطة
-- المؤشرات التلقائية وقت الحفظ (حضور، تقدّم خطط، اختبارات، غياب المعلّم
-- المُدخل يدوياً). total_pct والتوصية تُحسبان بالكود وتُخزَّنان لقطةً.
CREATE TABLE IF NOT EXISTS teacher_evaluations (
  id             SERIAL      PRIMARY KEY,
  mosque_id      INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  teacher_id     INTEGER     NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  halaqah_id     INTEGER     REFERENCES halaqahs(id) ON DELETE SET NULL,
  period         TEXT        NOT NULL CHECK (period ~ '^[0-9]{4}(-T[12])?$'),
  scores         JSONB       NOT NULL DEFAULT '{}',
  indicators     JSONB       NOT NULL DEFAULT '{}',
  total_pct      NUMERIC(5, 1),
  recommendation TEXT        CHECK (recommendation IS NULL
                   OR recommendation IN ('renew', 'renew_remedial', 'not_recommended')),
  notes          TEXT        NOT NULL DEFAULT '',
  evaluated_by   TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (teacher_id, period)
);

CREATE INDEX IF NOT EXISTS teacher_evaluations_mosque_idx ON teacher_evaluations (mosque_id, period);

-- ————— الجمعيات —————

CREATE TABLE IF NOT EXISTS associations (
  id         SERIAL      PRIMARY KEY,
  name       TEXT        NOT NULL,
  city       TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- مدير جمعية: حساب مستقل (اسم مستخدم + scrypt كمدراء الجوامع). session_version
-- يُرفع لإبطال كل جلساته (تغيير كلمة المرور). قراءة فقط لجوامع جمعيته.
CREATE TABLE IF NOT EXISTS association_admins (
  id              SERIAL      PRIMARY KEY,
  association_id  INTEGER     NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  username        TEXT        NOT NULL UNIQUE,
  password_hash   TEXT        NOT NULL,
  session_version INTEGER     NOT NULL DEFAULT 0,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS association_admins_association_idx ON association_admins (association_id);

-- ربط الجامع بجمعيته (اختياري). حذف الجمعية يفكّ الربط فقط ولا يحذف الجامع.
ALTER TABLE mosques ADD COLUMN IF NOT EXISTS association_id INTEGER REFERENCES associations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS mosques_association_idx ON mosques (association_id) WHERE association_id IS NOT NULL;

-- ————— الهوية الموحّدة: دور مدير جمعية —————
-- قيد role الأصلي (مضمَّن بتعريف العمود) اسمه memberships_role_check. نوسّعه
-- بقيمة 'association_admin' مرة واحدة فقط: نتخطّى إن كان التعريف الحالي
-- يحتويها أصلاً. الصفوف القائمة كلها ضمن القيم القديمة فلا يفشل التحقق.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'memberships'::regclass
      AND c.conname = 'memberships_role_check'
      AND pg_get_constraintdef(c.oid) LIKE '%association_admin%'
  ) THEN
    ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
    ALTER TABLE memberships ADD CONSTRAINT memberships_role_check
      CHECK (role IN ('developer', 'mosque_admin', 'supervisor', 'assistant', 'student', 'parent', 'association_admin'));
  END IF;
END
$$;
