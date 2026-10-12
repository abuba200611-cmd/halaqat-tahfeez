-- STEP 63 — الخطة الشهرية لكل طالب (مستهدف الحفظ والمراجعة بالصفحات).
-- إضافي بالكامل وقابل للتشغيل المتكرر: لا يلمس أي جدول أو عمود قائم.
--
-- month = شهر هجري (أم القرى) بصيغة 'YYYY-MM' مثل '1448-04'. الإنجاز الفعلي
-- لا يُخزَّن هنا أبداً — يُحسب من ward_logs داخل النطاق الميلادي للشهر.
-- halaqah_id يطابق students(teacher_id, id) (نفس نمط attendance).
-- نطاق الحفظ (سورة/آية) اختياري: إما الأعمدة الأربعة معاً أو كلها NULL.
CREATE TABLE IF NOT EXISTS monthly_plans (
  halaqah_id          INTEGER     NOT NULL,
  student_id          TEXT        NOT NULL,
  month               TEXT        NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  hifz_from_surah     INTEGER     CHECK (hifz_from_surah BETWEEN 1 AND 114),
  hifz_from_ayah      INTEGER     CHECK (hifz_from_ayah >= 1),
  hifz_to_surah       INTEGER     CHECK (hifz_to_surah BETWEEN 1 AND 114),
  hifz_to_ayah        INTEGER     CHECK (hifz_to_ayah >= 1),
  hifz_pages_target   INTEGER     NOT NULL DEFAULT 0 CHECK (hifz_pages_target BETWEEN 0 AND 604),
  review_pages_target INTEGER     NOT NULL DEFAULT 0 CHECK (review_pages_target BETWEEN 0 AND 604),
  notes               TEXT,
  created_by          INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (halaqah_id, student_id, month),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE,
  CHECK (
    (hifz_from_surah IS NULL AND hifz_from_ayah IS NULL AND hifz_to_surah IS NULL AND hifz_to_ayah IS NULL)
    OR
    (hifz_from_surah IS NOT NULL AND hifz_from_ayah IS NOT NULL AND hifz_to_surah IS NOT NULL AND hifz_to_ayah IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_monthly_plans_halaqah_month
  ON monthly_plans (halaqah_id, month);
