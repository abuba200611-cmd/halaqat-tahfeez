-- حماية بسيطة من إنشاء حسابات وهمية بالجملة: يسجّل كل محاولة تسجيل
-- بعنوان IP، ونرفض المحاولة لو تجاوز حداً معقولاً خلال ساعة.
CREATE TABLE IF NOT EXISTS register_attempts (
  id         SERIAL PRIMARY KEY,
  ip         TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_register_attempts_ip_time ON register_attempts(ip, created_at);
