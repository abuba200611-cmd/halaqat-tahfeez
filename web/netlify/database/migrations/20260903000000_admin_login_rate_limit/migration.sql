-- STEP 6E (M1) — حماية POST /api/admin/login من brute-force. جدول مستقل
-- تماماً عن login_attempts/register_attempts/student_link_attempts —
-- نفس النمط بالضبط، بلا مشاركة أي عدّاد. يُسجَّل صف فقط عند فشل مقارنة
-- ADMIN_SECRET — النجاح لا يُستهلك من الحصة إطلاقاً.
CREATE TABLE IF NOT EXISTS admin_login_attempts (
  id         SERIAL PRIMARY KEY,
  ip         TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_ip_time ON admin_login_attempts(ip, created_at);
