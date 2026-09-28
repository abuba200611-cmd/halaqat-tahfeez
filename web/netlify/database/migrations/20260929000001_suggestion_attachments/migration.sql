-- STEP 55(ب) — صور بلاغات المشاكل (معلّم أو طالب)، جدول واحد مشترك بدل
-- جدولين منفصلين: عمود واحد فعلياً NOT NULL دائماً (num_nonnulls = 1)
-- حسب مصدر البلاغ، فمسار عرض الصورة للأدمن (SELECT ... WHERE id = $1)
-- لا يحتاج معرفة المصدر إطلاقاً — id واحد فريد يكفي.
--
-- الصور تُخزَّن مُعاد ترميزها WebP فقط (lib/image-processing.ts يرفض
-- أي شيء آخر قبل الوصول هنا) — لذا mime دائماً 'image/webp' عملياً،
-- لكن CHECK صريح هنا أيضاً كحارس ثانٍ على مستوى القاعدة نفسها.
-- الحد الأقصى ٣ صور لكل بلاغ يُفرَض بالتطبيق (COUNT قبل الإدراج)، لا
-- بقيد SQL — يطابق نمط MAX_REVIEW_SEGMENTS بـlib/ward-ayah.ts.
CREATE TABLE IF NOT EXISTS suggestion_attachments (
  id                    SERIAL      PRIMARY KEY,
  teacher_suggestion_id INTEGER     REFERENCES suggestions(id) ON DELETE CASCADE,
  student_suggestion_id INTEGER     REFERENCES student_suggestions(id) ON DELETE CASCADE,
  mime                  TEXT        NOT NULL CHECK (mime IN ('image/webp')),
  bytes                 BYTEA       NOT NULL,
  size_bytes            INTEGER     NOT NULL CHECK (size_bytes <= 1048576),
  width                 INTEGER,
  height                INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(teacher_suggestion_id, student_suggestion_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_suggestion_attachments_teacher
  ON suggestion_attachments (teacher_suggestion_id) WHERE teacher_suggestion_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suggestion_attachments_student
  ON suggestion_attachments (student_suggestion_id) WHERE student_suggestion_id IS NOT NULL;
