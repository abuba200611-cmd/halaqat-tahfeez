-- STEP 64 — التلاوات الصوتية: الطالب يسجّل/يرفع تلاوته والمعلّم يستمع ويقيّم.
-- إضافي بالكامل وقابل للتشغيل المتكرر: لا يلمس أي جدول أو عمود قائم.
--
-- الصوت يُخزَّن في BYTEA بنفس أسلوب suggestion_attachments (لا خدمة تخزين
-- جديدة). الحدود (٣ ميغابايت، ٣ دقائق، الصيغ المسموحة) تُفرَض بالتطبيق بعد
-- فحص الـmagic bytes، وتتكرر هنا كحارس ثانٍ على مستوى القاعدة. الاحتفاظ بآخر
-- ١٠ تلاوات لكل طالب يُفرَض بالتطبيق عند الإدراج.
--
-- halaqah_id يطابق students(teacher_id, id) (teacher_id يحمل معرّف الحلقة،
-- وid من نوع TEXT) — حذف الطالب يحذف تلاواته.
CREATE TABLE IF NOT EXISTS recitations (
  id           SERIAL      PRIMARY KEY,
  halaqah_id   INTEGER     NOT NULL,
  student_id   TEXT        NOT NULL,
  surah        INTEGER     NOT NULL CHECK (surah BETWEEN 1 AND 114),
  from_ayah    INTEGER     NOT NULL CHECK (from_ayah >= 1),
  to_ayah      INTEGER     NOT NULL,
  mime         TEXT        NOT NULL CHECK (mime IN (
                 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a')),
  size_bytes   INTEGER     NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 3145728),
  duration_sec INTEGER     NOT NULL CHECK (duration_sec BETWEEN 1 AND 180),
  audio        BYTEA       NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  score        INTEGER     CHECK (score IS NULL OR score BETWEEN 1 AND 10),
  teacher_note TEXT,
  reviewed_by  INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ,
  CHECK (to_ayah >= from_ayah),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recitations_halaqah_status
  ON recitations (halaqah_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_recitations_student
  ON recitations (halaqah_id, student_id, created_at DESC);
