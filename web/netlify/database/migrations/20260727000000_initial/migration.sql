CREATE TABLE IF NOT EXISTS teachers (
  id            SERIAL PRIMARY KEY,
  username      TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  halaqah_name  TEXT    NOT NULL DEFAULT 'حلقتي',
  created_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS students (
  id          TEXT    NOT NULL,
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  group_name  TEXT    NOT NULL DEFAULT '',
  ranges      TEXT    NOT NULL DEFAULT '[]',
  mastery     TEXT    NOT NULL DEFAULT '{}',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  username    TEXT,
  password_hash TEXT,
  PRIMARY KEY (teacher_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username
  ON students(username) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id          SERIAL PRIMARY KEY,
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL,
  weekdays    TEXT    NOT NULL DEFAULT '[]',
  data        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  UNIQUE (teacher_id, year, month)
);

CREATE TABLE IF NOT EXISTS ward_logs (
  id           SERIAL PRIMARY KEY,
  teacher_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id   TEXT    NOT NULL,
  date         TEXT    NOT NULL,
  hifz_from    INTEGER,
  hifz_to      INTEGER,
  review_from  INTEGER,
  review_to    INTEGER,
  note         TEXT    NOT NULL DEFAULT '',
  status       TEXT    NOT NULL DEFAULT 'new',
  created_at   TEXT    NOT NULL,
  FOREIGN KEY (teacher_id, student_id)
    REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          SERIAL PRIMARY KEY,
  teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  endpoint    TEXT    NOT NULL UNIQUE,
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  created_at  TEXT    NOT NULL
);

-- ربط طالب في هذا النظام بحسابه في نظام تسجيل الورد المستقل (tasjeel-tullab).
-- منفصل عمداً عن عمودَي username/password_hash في students، لأن ذَينك
-- لتسجيل دخول الطالب داخل هذا النظام نفسه (ميزة أخرى)، لا للربط الخارجي.
CREATE TABLE IF NOT EXISTS student_links (
  teacher_id     INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  student_id     TEXT    NOT NULL,
  link_username  TEXT    NOT NULL,
  last_pulled_at TEXT,
  last_summary   TEXT,
  PRIMARY KEY (teacher_id, student_id),
  FOREIGN KEY (teacher_id, student_id)
    REFERENCES students(teacher_id, id) ON DELETE CASCADE
);
