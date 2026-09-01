-- STEP 6B — ربط طالب أكاديمي موجود مسبقاً بحساب Google عبر رمز ربط
-- شخصي لمرة واحدة يصدره المعلّم. الرمز الخام لا يُخزَّن أبداً، فقط
-- هاشه (sha256). token_hash فريد، والاستهلاك ذرّي عبر UPDATE شرطي
-- (WHERE used_at IS NULL AND expires_at > now()) — لا حذف للصف حتى
-- يبقى أثر تدقيق (متى استُخدم، من أنشأه). الـFK المركّب مطابق تماماً
-- لنمط student_accounts من STEP 3: (halaqah_id, student_id) يشير إلى
-- students(teacher_id, id) رغم اختلاف اسم العمود تاريخياً.
CREATE TABLE IF NOT EXISTS student_google_link_tokens (
  id                     SERIAL PRIMARY KEY,
  halaqah_id             INTEGER NOT NULL,
  student_id             TEXT    NOT NULL,
  token_hash             TEXT    NOT NULL UNIQUE,
  created_by_type        TEXT    NOT NULL,
  created_by_id          INTEGER NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at             TIMESTAMPTZ NOT NULL,
  used_at                TIMESTAMPTZ,
  used_provider_subject  TEXT,

  FOREIGN KEY (halaqah_id, student_id)
    REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

-- يخدم استعلام "هل لهذا الطالب رمز فعّال؟" لواجهة المعلّم لاحقاً
CREATE INDEX IF NOT EXISTS idx_link_tokens_active
  ON student_google_link_tokens (halaqah_id, student_id)
  WHERE used_at IS NULL;

-- حماية من تخمين/استنزاف رموز الربط بالجملة — نفس نمط register_attempts
-- بالضبط (STEP 6A/6B ليست تسجيل حساب، فمعدّل منفصل تماماً بلا تشارك
-- العدّاد مع محاولات تسجيل المعلّمين).
CREATE TABLE IF NOT EXISTS student_link_attempts (
  id         SERIAL PRIMARY KEY,
  ip         TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_link_attempts_ip_time ON student_link_attempts(ip, created_at);
