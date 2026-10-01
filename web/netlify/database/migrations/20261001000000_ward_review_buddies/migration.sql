-- STEP 56 — زميل المراجعة: طالب يختار زميل (اختياري) من نفس حلقته
-- بالضبط عند تسجيل ورده كـ"راجعت معه"، والزميل يؤكّد أو يرفض. لا رؤية
-- لسجلّ أي طرف للآخر — فقط اسم + تاريخ على بطاقة التأكيد.
--
-- "نفس الحلقة فقط" مضمونة من قاعدة البيانات نفسها لا من التطبيق وحده:
-- الـFK الأول يربط الصف بورد حقيقي بنفس حلقته بالضبط (لا يمكن تزوير
-- teacher_id)، والثاني يفرض أن الزميل من نفس تلك الحلقة حرفياً. منع
-- اختيار النفس أيضاً DB-level عبر CHECK على نفس الصف — خزّنّا
-- requester_student_id مكرَّراً عمداً (نسخة من ward_logs.student_id وقت
-- الإدراج) لإتاحة ذلك، لأن Postgres لا يسمح بـCHECK يستعلم جدولاً ثانياً.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ward_logs_id_teacher_student_unique'
  ) THEN
    ALTER TABLE ward_logs ADD CONSTRAINT ward_logs_id_teacher_student_unique
      UNIQUE (id, teacher_id, student_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ward_review_buddies (
  id                    SERIAL PRIMARY KEY,
  ward_log_id           INTEGER NOT NULL UNIQUE,
  teacher_id            INTEGER NOT NULL,
  -- نسخة من ward_logs.student_id وقت الإدراج — تتيح CHECK أدناه بنفس الصف
  requester_student_id  TEXT    NOT NULL,
  buddy_student_id      TEXT    NOT NULL,
  status                TEXT    NOT NULL DEFAULT 'pending',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at          TIMESTAMPTZ,
  FOREIGN KEY (ward_log_id, teacher_id, requester_student_id)
    REFERENCES ward_logs(id, teacher_id, student_id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id, buddy_student_id)
    REFERENCES students(teacher_id, id) ON DELETE CASCADE,
  CONSTRAINT ward_review_buddies_not_self CHECK (buddy_student_id <> requester_student_id),
  CONSTRAINT ward_review_buddies_status_check CHECK (status IN ('pending', 'confirmed', 'declined'))
);

-- "بطاقة بانتظار تأكيدك" بصفحة الزميل الرئيسية: كل طلباته المعلّقة
CREATE INDEX IF NOT EXISTS idx_ward_review_buddies_buddy_status
  ON ward_review_buddies (teacher_id, buddy_student_id, status);
