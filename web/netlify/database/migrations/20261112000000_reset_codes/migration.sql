-- رموز استرجاع كلمة المرور المكوّنة من ٦ أرقام — إضافي بالكامل (لا يمس الصفوف القائمة).
-- يعاد استخدام password_resets: عمود token_hash يحمل HMAC الرمز (لا الرمز نفسه)،
-- وkind يميّز صفوف الرموز عن روابط الاسترجاع القديمة، وattempts عدّاد المحاولات الخاطئة.
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'link';
ALTER TABLE password_resets ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS password_resets_teacher_kind_idx ON password_resets (teacher_id, kind);
