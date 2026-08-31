-- MVP Migration Foundation — الخطوة ٢: ربط الحلقة بجامع (اختياري).
-- عمود واحد NULLable على halaqahs فقط — لا تعديل على أي عمود موجود،
-- ولا على أي جدول آخر. الحلقات الحالية والجديدة تبقى mosque_id = NULL
-- افتراضياً لحين ربطها يدوياً بجامع (خطوة لاحقة خارج نطاق هذا الملف).

ALTER TABLE halaqahs
ADD COLUMN mosque_id INTEGER REFERENCES mosques(id);
