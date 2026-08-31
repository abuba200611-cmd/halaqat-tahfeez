-- MVP Migration Foundation — الخطوة ٣: student_accounts.
-- جدول جديد بحت — يربط "هوية دخول" (جوجل مستقبلاً، أو أي مزوّد آخر)
-- بصف طالب أكاديمي موجود فعلاً بجدول students. لا تعديل على students
-- ولا أي جدول آخر. الجدول يبقى فارغاً بعد هذي الهجرة — لا إنشاء حسابات
-- فعلية، ولا ربط بأي طالب حقيقي.
--
-- تسمية العمود halaqah_id (لا teacher_id) عمداً — تصحيح واعٍ لخطأ
-- التسمية القديم، رغم إن الـFK المركّب يشير لعمود students.teacher_id
-- (الذي يحمل تاريخياً معنى halaqah_id فعلاً؛ لا نلمس تسميته الآن).

CREATE TABLE student_accounts (
  id               SERIAL PRIMARY KEY,
  halaqah_id       INTEGER NOT NULL,
  student_id       TEXT NOT NULL,
  provider         TEXT NOT NULL,        -- 'google' | 'password' | 'tasjeel_link' | مزوّدون مستقبليون
  provider_subject TEXT NOT NULL,        -- معرّف المزوّد الثابت (Google sub، لا البريد)
  provider_email   TEXT,                 -- للعرض/التواصل فقط — ممنوع استخدامه كمفتاح مطابقة
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_subject),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);
