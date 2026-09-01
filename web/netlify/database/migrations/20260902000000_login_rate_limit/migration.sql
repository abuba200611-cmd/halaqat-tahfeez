-- STEP 6C — حماية تسجيل دخول المعلّم والطالب من brute-force. جدول مستقل
-- تماماً عن register_attempts/student_link_attempts (لا يشارك عدّاده مع
-- أي فعل آخر). يُسجَّل صف هنا فقط عند فشل محاولة دخول — النجاح لا يُستهلك
-- من الحصة إطلاقاً.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         SERIAL PRIMARY KEY,
  ip         TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, created_at);
