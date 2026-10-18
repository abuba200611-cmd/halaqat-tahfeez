-- B2 — المراسلة الداخلية: محادثات معلّم ↔ ولي أمر (لكل طالب) ومعلّم ↔
-- طالب وإدارة جامع ↔ معلّم، مع الرسائل وعدّادات القراءة.
-- إضافي بالكامل وقابل للتشغيل المتكرر: CREATE TABLE/INDEX IF NOT EXISTS فقط،
-- لا تعديل ولا حذف لأي شيء قائم.
--
-- هوية الأطراف هنا هي الهويات القائمة نفسها (معرّف المعلّم/الطالب/ولي
-- الأمر/مدير الجامع). الطالب يُعرَّف دائماً بثنائية (الحلقة، معرّف الطالب)
-- — students مفتاحها المركّب (teacher_id, id) — لذا تحمل المحادثة
-- halaqah_id مع student_id. participant_id/sender_id من نوع TEXT لأن معرّف
-- الطالب نصّي، والأدوار الرقمية تُخزَّن نصّاً (نفس نمط memberships.legacy_id).

-- ————— المحادثات —————
-- dedup_key هو قيد التفرد العملي: محادثة واحدة فقط لكل (النوع، الطالب،
-- المعلّم [، ولي الأمر] / مدير الجامع) مهما ضُغط زر «محادثة جديدة» أو
-- تسبقت طلبات متوازية — INSERT ... ON CONFLICT (dedup_key) DO NOTHING
-- يجد المحادثة القائمة أو ينشئها ذرّياً.
-- CHECK يطابق الأعمدة مع النوع: teacher_parent (حلقة+طالب+معلّم+ولي)،
-- teacher_student (حلقة+طالب+معلّم)، admin_teacher (مدير+معلّم فقط).
CREATE TABLE IF NOT EXISTS conversations (
  id              SERIAL      PRIMARY KEY,
  mosque_id       INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  kind            TEXT        NOT NULL
                  CHECK (kind IN ('teacher_parent', 'teacher_student', 'admin_teacher')),
  halaqah_id      INTEGER,
  student_id      TEXT,
  teacher_id      INTEGER,
  parent_id       INTEGER     REFERENCES parents(id) ON DELETE CASCADE,
  admin_id        INTEGER,
  dedup_key       TEXT        NOT NULL UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  CHECK (
    (kind = 'teacher_parent' AND halaqah_id IS NOT NULL AND student_id IS NOT NULL
       AND teacher_id IS NOT NULL AND parent_id IS NOT NULL AND admin_id IS NULL)
    OR (kind = 'teacher_student' AND halaqah_id IS NOT NULL AND student_id IS NOT NULL
       AND teacher_id IS NOT NULL AND parent_id IS NULL AND admin_id IS NULL)
    OR (kind = 'admin_teacher' AND halaqah_id IS NULL AND student_id IS NULL
       AND teacher_id IS NOT NULL AND parent_id IS NULL AND admin_id IS NOT NULL)
  ),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

-- لا FK من teacher_id/admin_id عمداً (نفس مبدأ memberships: الحسابات لا
-- تُحذف بل تُوقَف، والتحقق من العلاقات الحقيقية يجري بالكود عند بدء
-- المحادثة — القيد هنا شكلي والمسؤولية على مسارات الـAPI).

CREATE INDEX IF NOT EXISTS idx_conversations_mosque
  ON conversations (mosque_id, last_message_at DESC);

-- ————— الأطراف —————
-- عضوية الوصول: صف واحد لكل طرف في كل محادثة، يحمل آخر قراءة لحساب غير
-- المقروء. PRIMARY KEY يمنع تكرار الطالب نفسه مرتين بمحادثة واحدة.
CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id INTEGER     NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind            TEXT        NOT NULL
                  CHECK (kind IN ('teacher', 'student', 'parent', 'mosque_admin')),
  participant_id  TEXT        NOT NULL,
  last_read_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, kind, participant_id)
);

-- صندوق الوارد يُجلب بالطرف: هذا الفهرس يخدم «محادثاتي» لكل دور
CREATE INDEX IF NOT EXISTS idx_conversation_participants_member
  ON conversation_participants (kind, participant_id);

-- ————— الرسائل —————
-- نص خام فقط (يُقصّ أطرافه ويُرفض الفارغ بالكود قبل الوصول هنا)، بلا HTML
-- إطلاقاً — الواجهة تعرضه نصاً عادياً. حذف ناعم اختياري (deleted_at).
CREATE TABLE IF NOT EXISTS messages (
  id              BIGSERIAL   PRIMARY KEY,
  conversation_id INTEGER     NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_kind     TEXT        NOT NULL
                  CHECK (sender_kind IN ('teacher', 'student', 'parent', 'mosque_admin')),
  sender_id       TEXT        NOT NULL,
  body            TEXT        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

-- تصفّح المحادثة بالمعرّف (المؤشر/الصفحات) وبالوقت للعدّادات
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at DESC, id DESC);
