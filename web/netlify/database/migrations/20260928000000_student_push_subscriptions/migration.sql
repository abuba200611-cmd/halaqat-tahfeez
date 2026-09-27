-- STEP 54 — اشتراكات إشعارات الطالب (Web Push)، بمعزل تام عن
-- push_subscriptions الحالي (خاص بالمعلّم وحده، لا نلمسه).
--
-- تصحيح على المواصفة المطلوبة: student_id TEXT لا INTEGER — عمود
-- students.id نفسه TEXT (مفتاحه المركّب PRIMARY KEY (teacher_id, id)،
-- راجع migration الأولي 20260727000000_initial)، وكذلك ward_logs.
-- student_id TEXT بنفس السبب. مفتاح مركّب من نوع مختلف عن العمود
-- المرجعي يفشل عند إنشاء الـFK نفسه، فطابقت النوع الفعلي القائم.
--
-- تذكير من نفس الطلب (صحيح ومطابق للكود الفعلي): عمود teacher_id هنا —
-- مثل students.teacher_id وward_logs.teacher_id — يخزّن فعلياً معرّف
-- الحلقة (halaqahs.id)، لا معرّف حساب معلّم فرد؛ الاسم تاريخي فقط.
CREATE TABLE IF NOT EXISTS student_push_subscriptions (
  id              SERIAL      PRIMARY KEY,
  teacher_id      INTEGER     NOT NULL,
  student_id      TEXT        NOT NULL,
  endpoint        TEXT        NOT NULL UNIQUE,
  p256dh          TEXT        NOT NULL,
  auth            TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  FOREIGN KEY (teacher_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_student_push_subscriptions_student
  ON student_push_subscriptions (teacher_id, student_id);
