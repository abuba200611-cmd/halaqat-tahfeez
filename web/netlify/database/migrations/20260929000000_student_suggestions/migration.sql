-- STEP 55 — اقتراح/بلاغ من الطالب، بمعزل تام عن جدول suggestions
-- (خاص بالمعلّمين وحده، لا نلمسه). لا sender_label مخزَّن هنا (خلافاً
-- لـsuggestions) — اسم الطالب واسم حلقته يُحسبان وقت العرض بربط
-- students/halaqahs، فيبقيان صحيحين حتى لو تغيّر اسم الطالب لاحقاً.
CREATE TABLE IF NOT EXISTS student_suggestions (
  id         SERIAL      PRIMARY KEY,
  teacher_id INTEGER     NOT NULL,
  student_id TEXT        NOT NULL,
  kind       TEXT        NOT NULL CHECK (kind IN ('suggestion', 'bug')),
  body       TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (teacher_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_suggestions_student
  ON student_suggestions (teacher_id, student_id, created_at);
