-- خيار على مستوى الحلقة: إظهار زملاء الحلقة للطلاب (أسماء فقط).
-- إضافي فقط وقابل للتشغيل المتكرر؛ الافتراض false = مخفي حتى يفعّله المعلّم.

ALTER TABLE halaqahs ADD COLUMN IF NOT EXISTS classmates_visible BOOLEAN NOT NULL DEFAULT false;
