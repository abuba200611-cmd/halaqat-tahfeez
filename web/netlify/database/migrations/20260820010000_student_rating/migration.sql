-- تقييم نجمي (٠..٥) يضعه المعلّم لكل طالب — لا يظهر للطالب نفسه في أي
-- مكان (لا في StudentAccount ولا في أي مسار API يصل له الطالب مباشرة).
ALTER TABLE students ADD COLUMN IF NOT EXISTS rating SMALLINT NOT NULL DEFAULT 0
  CHECK (rating BETWEEN 0 AND 5);
