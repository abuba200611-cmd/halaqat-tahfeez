-- اسم المعلّم الشخصي، منفصل عن اسم الحلقة — يُعرض بالترحيب وبالبريد.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS teacher_name TEXT NOT NULL DEFAULT '';
