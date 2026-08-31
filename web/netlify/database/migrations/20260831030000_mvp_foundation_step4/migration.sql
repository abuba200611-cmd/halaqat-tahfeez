-- MVP Migration Foundation — الخطوة ٤: تجهيز ward_logs لدورة المراجعة
-- والاعتماد لاحقاً. أربعة أعمدة NULLable فقط — لا تعديل على أي عمود
-- موجود، لا لمس لنوع status ولا لأي قيمة به. لا كود تطبيق يقرأ هذي
-- الأعمدة بعد (هذي قاعدة بيانات فقط، الـWorkflow خطوة مستقبلية منفصلة).

ALTER TABLE ward_logs
  ADD COLUMN previous_attempt_id INTEGER REFERENCES ward_logs(id),
  ADD COLUMN reviewed_by         INTEGER REFERENCES teachers(id),
  ADD COLUMN reviewed_at         TIMESTAMPTZ,
  ADD COLUMN review_note         TEXT;
