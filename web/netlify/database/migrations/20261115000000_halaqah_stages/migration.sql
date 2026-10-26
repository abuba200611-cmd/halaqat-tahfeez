-- فئة الحلقة + من سجّل الورد. إضافي بحت وقابل للتشغيل المتكرر.
-- NULL في halaqahs.stage = النمط الحالي دون أي تغيير (SC-005).
-- NULL في ward_logs.recorded_via = ورد قديم سجّله الطالب بنفسه.

ALTER TABLE halaqahs
  ADD COLUMN IF NOT EXISTS stage TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'halaqahs_stage_check'
  ) THEN
    ALTER TABLE halaqahs ADD CONSTRAINT halaqahs_stage_check
      CHECK (stage IS NULL OR stage IN ('primary', 'intermediate', 'secondary', 'university'));
  END IF;
END $$;

ALTER TABLE ward_logs
  ADD COLUMN IF NOT EXISTS recorded_by_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorded_via TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ward_logs_recorded_via_check'
  ) THEN
    ALTER TABLE ward_logs ADD CONSTRAINT ward_logs_recorded_via_check
      CHECK (recorded_via IS NULL OR recorded_via IN ('student', 'teacher', 'queue'));
  END IF;
END $$;

-- حارس التكرار اليومي (FR-005) يبحث بـ (teacher_id, student_id, date)؛ فهرس (teacher_id, date) قائم لكنه لا يغطي الطالب.
CREATE INDEX IF NOT EXISTS idx_ward_logs_halaqah_student_date
  ON ward_logs (teacher_id, student_id, date);
