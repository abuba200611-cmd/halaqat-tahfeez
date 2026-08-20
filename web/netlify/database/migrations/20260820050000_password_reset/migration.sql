-- رموز استرجاع كلمة المرور — الرمز نفسه لا يُخزَّن، بل بصمته (هاش) فقط،
-- وله صلاحية ساعة واحدة ويُحذف بعد الاستخدام.
CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TEXT    NOT NULL
);
