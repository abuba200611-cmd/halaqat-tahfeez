-- يفرّق بين اقتراح تطوير وبلاغ مشكلة بنفس الجدول — كلاهما "رسالة توصل
-- للمطوّر فقط"، الفرق نوعها فقط.
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'suggestion';
