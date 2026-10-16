-- A2 — الانضباط والمتابعة: سُلّم الغياب، سُلّم المخالفات، كشف المتابعة الشهري.
-- إضافي بالكامل وقابل للتشغيل المتكرر: لا يلمس أي جدول أو عمود قائم.
--
-- halaqah_id/student_id يطابقان students(teacher_id, id) بنفس نمط attendance
-- وmonthly_plans (teacher_id يحمل معرّف الحلقة، وid من نوع TEXT). الأرقام
-- كلها تُحسب من الجداول القائمة ولا تُخزَّن — المخزَّن هنا السجل والحالة فقط.

-- إعدادات لكل جامع بصيغة JSON (مفتاح ← قيمة). مفتاح "discipline" يحمل إعدادات
-- هذه الميزة كاملة؛ لاحقاً تُستخدم البنية نفسها لمفاتيح مزايا أخرى، وعلى
-- مستوى الرابطة عندما توجد (association_id عمود مستقبلي، ليس الآن).
CREATE TABLE IF NOT EXISTS mosque_settings (
  mosque_id  INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (mosque_id, key)
);

-- سجل أحداث الانضباط لكل طالب: إنذارات الغياب (الآلية)، استدعاء ولي الأمر،
-- تنبيه الإدارة، المخالفات (اليدوية بدرجات السُلّم)، والفصل النهائي.
-- kind: absence_warning (level 1=أول 2=ثاني) | parent_summons | admin_alert
--       | violation (level = درجة السُلّم 1..6) | dismissal
-- origin: auto = ولّده حساب سُلّم الغياب، manual = سجّله معلّم أو مدير الجامع.
-- acknowledged_at = إقرار بالاستلام/التوقيع (يعتمده المعلّم أو الإدارة).
CREATE TABLE IF NOT EXISTS discipline_events (
  id              SERIAL      PRIMARY KEY,
  halaqah_id      INTEGER     NOT NULL,
  student_id      TEXT        NOT NULL,
  kind            TEXT        NOT NULL CHECK (kind IN (
                    'absence_warning', 'parent_summons', 'admin_alert', 'violation', 'dismissal')),
  level           INTEGER     NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 6),
  reason          TEXT        NOT NULL DEFAULT '',
  origin          TEXT        NOT NULL DEFAULT 'manual' CHECK (origin IN ('auto', 'manual')),
  created_by      INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discipline_events_halaqah
  ON discipline_events (halaqah_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discipline_events_student
  ON discipline_events (halaqah_id, student_id, created_at DESC);

-- الحساب الآلي يعيد المحاولة عند كل حفظ حضور وكل فتح لصفحة الانضباط،
-- فهذا الفهرس الفريد الجزئي يمنع تكرار حدث غياب آلي لنفس (الطالب، النوع،
-- الدرجة) مهما أُعيد التشغيل — الإدراج بـON CONFLICT DO NOTHING.
CREATE UNIQUE INDEX IF NOT EXISTS uq_discipline_auto_absence
  ON discipline_events (halaqah_id, student_id, kind, level)
  WHERE origin = 'auto' AND kind IN ('absence_warning', 'parent_summons', 'admin_alert');

-- الإيقاف المؤقت: الطالب يصير غير فعّال (students.active = false) حتى
-- `until` ثم يُعاد تلقائياً بالكود عند أول قراءة لاحقة — بلا أي cron.
-- prev_active تحفظ حالته قبل الإيقاف فلا يعيده الاسترجاع فعّالاً لو كان
-- معطّلاً أصلاً لأسباب أخرى.
CREATE TABLE IF NOT EXISTS student_suspensions (
  id          SERIAL      PRIMARY KEY,
  halaqah_id  INTEGER     NOT NULL,
  student_id  TEXT        NOT NULL,
  event_id    INTEGER     NOT NULL REFERENCES discipline_events(id) ON DELETE CASCADE,
  days        INTEGER     NOT NULL CHECK (days BETWEEN 1 AND 365),
  until       TIMESTAMPTZ NOT NULL,
  prev_active BOOLEAN     NOT NULL DEFAULT TRUE,
  restored_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

-- إيقاف ساري واحد كحدّ أقصى لكل طالب؛ السجل المؤرشف (restored_at معبأ) بلا حدّ.
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_suspensions_active
  ON student_suspensions (halaqah_id, student_id) WHERE restored_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_student_suspensions_restore
  ON student_suspensions (until) WHERE restored_at IS NULL;

-- كشف المتابعة الشهري لكل حلقة: حالة التسليم والمراجعة فقط — أرقام الكشف
-- (حضور/حفظ/مراجعة/خطة/اختبارات/أحداث) تُحسب دائماً لحظة العرض ولا تُخزَّن.
-- month = شهر هجري (أم القرى) بصيغة 'YYYY-MM' مثل '1448-04'.
CREATE TABLE IF NOT EXISTS discipline_sheets (
  id           SERIAL      PRIMARY KEY,
  halaqah_id   INTEGER     NOT NULL REFERENCES halaqahs(id) ON DELETE CASCADE,
  month        TEXT        NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status       TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'reviewed')),
  notes        TEXT,
  submitted_by INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ,
  reviewed_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (halaqah_id, month)
);
