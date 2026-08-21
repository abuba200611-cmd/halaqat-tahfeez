-- تأكيد ملكية البريد عند التسجيل بكلمة مرور (حسابات جوجل موثّقة أصلاً
-- من جوجل نفسها، ما تحتاج هذا). لا يمنع الدخول — راجع lib/mail.ts
-- لملاحظة قيد Resend الحالي (يرسل فقط لبريد صاحب حساب Resend نفسه
-- حتى يُضاف نطاق موثّق).
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS email_verifications (
  id         SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TEXT    NOT NULL
);
