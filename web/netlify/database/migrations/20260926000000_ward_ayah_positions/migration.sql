-- STEP 49 — تسجيل الورد بالسورة والآيات بدل أرقام الصفحات مباشرة.
--
-- إضافي بحت: ثمانية أعمدة NULLABLE جديدة على ward_logs لحفظ نقطة بداية
-- ونهاية كل من الحفظ والمراجعة بالسورة/الآية. لا حذف، لا تعديل نوع أي
-- عمود قائم، ولا لمس لبيانات الصفوف الحالية — تبقى كل صفوف ward_logs
-- القديمة كما هي تماماً بأعمدتها الثمانية الجديدة NULL (تُعرض بالصفحات
-- كما كانت دائماً، بحسب متطلب STEP 49 نفسه).
--
-- الأعمدة الحالية hifz_from/hifz_to/review_from/review_to (أرقام صفحات)
-- تبقى تُملأ كما هي بلا أي تغيير في معناها أو مصدرها — الخادم يحسبها
-- من السورة/الآية عند توفّرها (lib/quran-surahs.ts: pageRangeOfAyahRange)
-- قبل الإدراج، فكل الإحصائيات والتقارير المبنية عليها تستمر بلا تعديل.
--
-- التسمية: *_surah / *_ayah لكل من حفظ/مراجعة × بداية/نهاية — نفس نمط
-- تسمية hifz_from/hifz_to الحالي، موسّعاً لبعدين بدل رقم واحد.
--
-- لا تُطبَّق هذه الهجرة على قاعدة الإنتاج تلقائياً بهذا الـcommit —
-- بانتظار نسخة احتياطية (Neon branch) وموافقة صريحة، كما طُلب بالخطوة.

ALTER TABLE ward_logs
  ADD COLUMN IF NOT EXISTS hifz_from_surah   INTEGER,
  ADD COLUMN IF NOT EXISTS hifz_from_ayah    INTEGER,
  ADD COLUMN IF NOT EXISTS hifz_to_surah     INTEGER,
  ADD COLUMN IF NOT EXISTS hifz_to_ayah      INTEGER,
  ADD COLUMN IF NOT EXISTS review_from_surah INTEGER,
  ADD COLUMN IF NOT EXISTS review_from_ayah  INTEGER,
  ADD COLUMN IF NOT EXISTS review_to_surah   INTEGER,
  ADD COLUMN IF NOT EXISTS review_to_ayah    INTEGER;
