-- الرسوم والاشتراكات — سجل يدوي فقط (لا بوابة دفع). إضافي بالكامل وقابل
-- للتشغيل المتكرر: CREATE TABLE/INDEX IF NOT EXISTS، بلا تعديل ولا حذف لشيء قائم.
-- المبالغ كلها NUMERIC(10,2) (لا floats)؛ والكود يحسب بالهللات صحيحةً.
-- student_id/halaqah_id يطابقان students(teacher_id, id) (teacher_id يحمل معرّف
-- الحلقة منذ تعدّد المعلّمين، وid نصّي).

-- خطة رسوم لجامع: اسم + مبلغ + دورية. تُعطَّل ولا تُحذف (السجلات تشير إليها).
CREATE TABLE IF NOT EXISTS fee_plans (
  id         SERIAL        PRIMARY KEY,
  mosque_id  INTEGER       NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name       TEXT          NOT NULL,
  amount     NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  period     TEXT          NOT NULL CHECK (period IN ('monthly', 'term', 'yearly', 'once')),
  active     BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fee_plans_mosque_idx ON fee_plans (mosque_id, active);

-- مستحق طالب عن فترة (مثلاً '2026-10') بخطة. التفرّد على (الخطة، الحلقة،
-- الطالب، الفترة) هو ما يجعل توليد المستحقات متكرّر التشغيل بلا تكرار.
CREATE TABLE IF NOT EXISTS student_fees (
  id           SERIAL        PRIMARY KEY,
  mosque_id    INTEGER       NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  halaqah_id   INTEGER       NOT NULL,
  student_id   TEXT          NOT NULL,
  plan_id      INTEGER       NOT NULL REFERENCES fee_plans(id) ON DELETE RESTRICT,
  period_label TEXT          NOT NULL,
  amount_due   NUMERIC(10,2) NOT NULL CHECK (amount_due >= 0),
  amount_paid  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status       TEXT          NOT NULL DEFAULT 'due'
               CHECK (status IN ('due', 'partial', 'paid', 'waived')),
  due_date     DATE,
  notes        TEXT          NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CHECK (amount_paid <= amount_due),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE,
  UNIQUE (plan_id, halaqah_id, student_id, period_label)
);

CREATE INDEX IF NOT EXISTS student_fees_mosque_idx ON student_fees (mosque_id, period_label, status);
CREATE INDEX IF NOT EXISTS student_fees_student_idx ON student_fees (halaqah_id, student_id);

-- دفعة مسجَّلة (نقداً/تحويلاً/غيره) على مستحق. تُدرج مع تحديث amount_paid/status
-- بترانزاكشن واحدة من الكود. receipt_no يُولَّد من معرّف الدفعة.
CREATE TABLE IF NOT EXISTS fee_payments (
  id               SERIAL        PRIMARY KEY,
  student_fee_id   INTEGER       NOT NULL REFERENCES student_fees(id) ON DELETE CASCADE,
  amount           NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  paid_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  method           TEXT          NOT NULL CHECK (method IN ('cash', 'transfer', 'other')),
  receipt_no       TEXT,
  recorded_by_kind TEXT          NOT NULL DEFAULT 'mosque_admin',
  recorded_by_id   INTEGER,
  note             TEXT          NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS fee_payments_fee_idx ON fee_payments (student_fee_id, paid_at);
CREATE UNIQUE INDEX IF NOT EXISTS fee_payments_receipt_no_key ON fee_payments (receipt_no) WHERE receipt_no IS NOT NULL;
