-- دمج المنصة M6 — مساعد MOS (الإيجنت) فوق المنصة الموحّدة. إضافي بالكامل
-- وقابل للتراجع: أربعة جداول جديدة فقط، لا DROP ولا تعديل على أي جدول قائم.
--
-- agent_proposals: كل أداة كتابة يستدعيها الإيجنت لا تُنفَّذ، بل تُنشئ
-- مقترحاً هنا يظهر كبطاقة بالمحادثة، ولا يُنفَّذ إلا بضغطة الإنسان
-- («نفّذ» / «إلغاء») عبر دوال النطاق نفسها بتحققها الكامل.
-- agent_memories: ذاكرة تعلّم لكل جامع (تفضيلات وقرارات وأسئلة متكررة)
-- يحقنها باني السياق للإيجنت، بحدّ ٢٠٠ ذاكرة (تُقلَّم الأقدم من التطبيق).
-- agent_lessons: الدليل المشترك — دروس عامة مجهّلة يقترحها إيجنت جامع،
-- ولا تُحقن لكل الجوامع إلا بعد موافقة المطوّر من /dev ← «دروس الإيجنت».
-- agent_usage: احتساب التوكنات لكل جامع باليوم (تجميع بـ upsert).

CREATE TABLE IF NOT EXISTS agent_proposals (
  id          SERIAL PRIMARY KEY,
  mosque_id   INT NOT NULL REFERENCES mosques (id),
  -- معرّف مدير الجامع الذي أنشئ المقترح في جلسته، أو NULL للمشرف العام
  user_id     INT,
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'failed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_proposals_mosque_idx ON agent_proposals (mosque_id, id DESC);

CREATE TABLE IF NOT EXISTS agent_memories (
  id          SERIAL PRIMARY KEY,
  mosque_id   INT NOT NULL REFERENCES mosques (id),
  content     TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('agent', 'admin')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_memories_mosque_idx ON agent_memories (mosque_id, id DESC);

CREATE TABLE IF NOT EXISTS agent_lessons (
  id            SERIAL PRIMARY KEY,
  content       TEXT NOT NULL,
  from_mosque_id INT NOT NULL REFERENCES mosques (id),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS agent_lessons_status_idx ON agent_lessons (status, id DESC);

CREATE TABLE IF NOT EXISTS agent_usage (
  mosque_id     INT NOT NULL REFERENCES mosques (id),
  day           DATE NOT NULL,
  input_tokens  INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  PRIMARY KEY (mosque_id, day)
);
