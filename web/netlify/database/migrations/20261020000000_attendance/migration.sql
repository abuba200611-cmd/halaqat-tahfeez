-- STEP 62 — الحضور اليومي.
-- إضافي بالكامل وقابل للتشغيل المتكرر: لا يلمس أي جدول أو عمود قائم.
--
-- halaqah_id يطابق students(teacher_id, id) (teacher_id يحمل معرّف الحلقة
-- منذ تعدّد المعلّمين، وid من نوع TEXT). date بنفس صيغة ward_logs.date
-- (نصّ YYYY-MM-DD). الحضور الضمني (طالب أرسل ورداً ذلك اليوم) يُشتقّ
-- بالكود ولا يُخزَّن هنا — الصفّ المخزَّن هو القرار الصريح للمعلّم فقط.
CREATE TABLE IF NOT EXISTS attendance (
  halaqah_id  INTEGER     NOT NULL,
  student_id  TEXT        NOT NULL,
  date        TEXT        NOT NULL CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  status      TEXT        NOT NULL CHECK (status IN ('present', 'late', 'excused', 'absent')),
  note        TEXT,
  recorded_by INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (halaqah_id, student_id, date),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attendance_halaqah_date
  ON attendance (halaqah_id, date);

-- ward_logs بلا أي فهرس على (teacher_id, date) — استعلامات الملخّص واليوم
-- (DISTINCT student_id ... WHERE teacher_id AND date) كانت ستمسح الجدول كاملاً.
CREATE INDEX IF NOT EXISTS idx_ward_logs_halaqah_date
  ON ward_logs (teacher_id, date);
