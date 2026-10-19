-- نسخة جلسة مدير الجامع: رفعها عند تغيير كلمة المرور يُخرج الأجهزة الأخرى.
-- الجلسات القائمة بلا نسخة تُقرأ كنسخة ٠ = تبقى صالحة عند النشر.
ALTER TABLE mosque_admins ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;
