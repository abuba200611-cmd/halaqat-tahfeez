-- STEP 52 — المراجعة تصير قائمة مقاطع (١ إلى ١٠)، كل مقطع من سورة/آية
-- إلى سورة/آية، بدل نطاق واحد فقط.
--
-- إضافي بحت: جدول جديد كلياً، صفر ALTER على ward_logs أو أي عمود قائم.
-- لا حذف، لا تعديل نوع أو قيمة أي عمود حالي، ولا لمس لأي صف موجود.
--
-- التصميم: جدول تابع (child table) لا عمود JSONB — القرار وسببه مشروح
-- بالتفصيل بالرد المرافق لهذا الملف. باختصار: مصفوفة معروفة الحد
-- الأقصى (١٠) وقابلة للتوسّع لاحقاً، تحتاج CASCADE حقيقي عند حذف الورد
-- (DELETE FROM ward_logs يزيل مقاطعها تلقائياً بلا كود إضافي)، ولا
-- تحتاج فهرسة JSON — نمط علائقي بسيط أوضح من JSONB هنا.
--
-- from_page/to_page: محسوبتان ومخزَّنتان وقت الإدخال (بنفس نمط
-- hifz_from/hifz_to الحاليين على ward_logs) — لا إعادة حساب من السورة/
-- الآية عند كل قراءة، وتُستخدَمان لحساب "مجموع الصفحات" الدقيق (مجموع
-- كل مقطع على حدة، لا عرض النطاق الكامل من أول مقطع لآخره الذي كان
-- سيبالغ بالعدّ لو كان بين المقاطع فجوة).
--
-- الأوراد القديمة (قبل هذا التحديث) لا صف لها هنا إطلاقاً — تستمر
-- تُعرض وتُحسب من أعمدة review_from/review_to/review_from_surah/...
-- الحالية على ward_logs كما هي بالضبط، بلا أي تغيير في تلك الأعمدة أو
-- معناها. طبقة العرض/الحساب بالتطبيق تُفضّل هذا الجدول لو كان له صفوف
-- لورد معيّن، وإلا ترجع للأعمدة القديمة كما كانت — تفصيل كامل بالرد
-- المرافق.

CREATE TABLE IF NOT EXISTS ward_review_segments (
  id            SERIAL  PRIMARY KEY,
  ward_log_id   INTEGER NOT NULL REFERENCES ward_logs(id) ON DELETE CASCADE,
  segment_order INTEGER NOT NULL,
  from_surah    INTEGER NOT NULL,
  from_ayah     INTEGER NOT NULL,
  to_surah      INTEGER NOT NULL,
  to_ayah       INTEGER NOT NULL,
  from_page     INTEGER NOT NULL,
  to_page       INTEGER NOT NULL,
  UNIQUE (ward_log_id, segment_order)
);

CREATE INDEX IF NOT EXISTS idx_ward_review_segments_ward ON ward_review_segments(ward_log_id);
