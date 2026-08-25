-- الحلقة كيان مستقل عن حساب الدخول — يسمح بأكثر من معلّم لنفس الحلقة
-- (مشرف واحد + مساعدين)، بدل الافتراض القديم "حساب دخول = حلقة".
-- الجداول اللي كانت تُحدَّد بـ teacher_id (طلاب، جداول، أوراد، روابط
-- تسجيل-طلاب) تبقى بنفس اسم العمود لتقليل حجم الهجرة، لكن قيمتها تصير
-- معرّف الحلقة (halaqah_id) بدل معرّف حساب الدخول تحديداً.

CREATE TABLE halaqahs (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  invite_code         TEXT UNIQUE,          -- رابط انضمام الطلاب (تسجيل-طلاب / إدارة الجامع)
  teacher_invite_code TEXT UNIQUE,          -- رابط انضمام معلّم زميل (مساعد مشرف) لهذي الحلقة
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  legacy_teacher_id   INTEGER                -- للربط أثناء الهجرة فقط، عمود مساعد لا يُستخدم بالتطبيق
);

-- حلقة واحدة لكل حساب معلّم موجود حالياً، بنفس اسمها ورمز دعوتها القديم
-- (فما ينكسر أي رابط تسجيل طلاب أو ربط بنظام إدارة الجامع سبق توزيعه).
INSERT INTO halaqahs (name, invite_code, created_at, legacy_teacher_id)
SELECT COALESCE(NULLIF(halaqah_name, ''), 'حلقتي'), invite_code, created_at::timestamptz, id FROM teachers;

ALTER TABLE teachers ADD COLUMN halaqah_id INTEGER REFERENCES halaqahs(id);
ALTER TABLE teachers ADD COLUMN role TEXT NOT NULL DEFAULT 'supervisor';

UPDATE teachers SET halaqah_id = halaqahs.id
FROM halaqahs WHERE halaqahs.legacy_teacher_id = teachers.id;

ALTER TABLE teachers ALTER COLUMN halaqah_id SET NOT NULL;
ALTER TABLE halaqahs DROP COLUMN legacy_teacher_id;

-- إسقاط كل القيود اللي تربط teacher_id بجدول teachers مباشرة أولاً (على
-- دفعة واحدة) قبل تحديث القيم، تفادياً لانتهاك قيود المفاتيح المركّبة
-- (ward_logs/student_links) وقت التحديث المرحلي.
ALTER TABLE students DROP CONSTRAINT students_teacher_id_fkey;
ALTER TABLE schedules DROP CONSTRAINT schedules_teacher_id_fkey;
ALTER TABLE ward_logs DROP CONSTRAINT ward_logs_teacher_id_fkey;
ALTER TABLE ward_logs DROP CONSTRAINT ward_logs_teacher_id_student_id_fkey;
ALTER TABLE student_links DROP CONSTRAINT student_links_teacher_id_fkey;
ALTER TABLE student_links DROP CONSTRAINT student_links_teacher_id_student_id_fkey;

UPDATE students SET teacher_id = t.halaqah_id FROM teachers t WHERE students.teacher_id = t.id;
UPDATE schedules SET teacher_id = t.halaqah_id FROM teachers t WHERE schedules.teacher_id = t.id;
UPDATE ward_logs SET teacher_id = t.halaqah_id FROM teachers t WHERE ward_logs.teacher_id = t.id;
UPDATE student_links SET teacher_id = t.halaqah_id FROM teachers t WHERE student_links.teacher_id = t.id;

ALTER TABLE students ADD CONSTRAINT students_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES halaqahs(id) ON DELETE CASCADE;
ALTER TABLE schedules ADD CONSTRAINT schedules_teacher_id_fkey
  FOREIGN KEY (teacher_id) REFERENCES halaqahs(id) ON DELETE CASCADE;
ALTER TABLE ward_logs ADD CONSTRAINT ward_logs_teacher_id_student_id_fkey
  FOREIGN KEY (teacher_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE;
ALTER TABLE student_links ADD CONSTRAINT student_links_teacher_id_student_id_fkey
  FOREIGN KEY (teacher_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE;

-- push_subscriptions تبقى مرتبطة بحساب الدخول نفسه عمداً (كل معلّم يفعّل
-- الإشعارات على جهازه الخاص)، ما تحتاج أي تغيير.

-- الأعمدة القديمة على teachers صارت مكرّرة (halaqah_name/invite_code
-- انتقلا لجدول halaqahs) — نتركها بلا استخدام بدل حذفها فوراً، أسلم لو
-- احتجنا نتحقق من شيء أثناء التبديل. يمكن حذفها بهجرة لاحقة بعد التأكد.
