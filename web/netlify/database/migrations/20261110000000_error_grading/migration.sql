-- تقييم الورد بنقاط الأخطاء + الحضور بالرمز. إضافي بالكامل وقابل للتشغيل
-- المتكرر: أعمدة ADD COLUMN IF NOT EXISTS فقط، بلا تعديل ولا حذف لشيء قائم.
-- الإعدادات (أنواع الأخطاء، الخصومات، التقديرات) لا تُخزَّن هنا: هي إعداد
-- لكل جامع في mosque_settings بالمفتاح "error_grading" بافتراضيات بالكود.

-- عدّادات الأخطاء {مفتاح النوع: العدد}، والدرجة المحسوبة بالخادم، والتقدير
-- نصّاً وقت التقييم (لا يتغيّر تاريخياً لو غيّر الجامع حدوده). كلها NULL
-- لأي ورد لم يُقيَّم بالنقاط — فالتقييم القائم يعمل كما هو.
ALTER TABLE ward_logs ADD COLUMN IF NOT EXISTS error_counts JSONB;
ALTER TABLE ward_logs ADD COLUMN IF NOT EXISTS error_score  NUMERIC(6,2);
ALTER TABLE ward_logs ADD COLUMN IF NOT EXISTS error_band   TEXT;

-- مصدر تسجيل الحضور: 'qr' حين يمسح الطالب الرمز، NULL للتسجيل اليدوي.
-- نفس جدول الحضور القائم — لا نظام موازٍ.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS checkin_source TEXT;
