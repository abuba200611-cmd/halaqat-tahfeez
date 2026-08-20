-- اقتراحات تطوير يرسلها المعلّم — تصل للمطوّر فقط عبر لوحة محمية بكلمة سر.
CREATE TABLE IF NOT EXISTS suggestions (
  id           SERIAL PRIMARY KEY,
  sender_id    INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  sender_label TEXT    NOT NULL,
  message      TEXT    NOT NULL,
  created_at   TEXT    NOT NULL
);
