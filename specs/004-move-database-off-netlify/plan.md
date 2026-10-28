# خطة التنفيذ: نقل قاعدة البيانات من Netlify

**المواصفة**: [spec.md](./spec.md)

## الملخّص

نبقي مكتبة `@netlify/database` كعميل (تقبل `connectionString`)، ونضيف متغيراً `DATABASE_URL` يشير لقاعدة Neon جديدة، ونكتب مُشغّل مايقريشنز صغيراً يُشغَّل يدوياً من GitHub Actions، ثم ننقل البيانات بـ `pg_dump`/`pg_restore` في نافذة صيانة.

## فحص الدستور

| المبدأ | الحالة |
|---|---|
| II. الخصوصية والأمان | ✅ الأسرار في Vercel وأسرار GitHub فقط؛ الوكيل لا يقرأها؛ السكربتات لا تطبعها |
| III. قاعدة إضافية فقط + موافقة صريحة | ✅ لا تغيير مخطط؛ المايقريشنز بتشغيل يدوي فقط |
| IV. البوابات | ✅ اختبارات للمُشغّل (ترتيب، تخطّي المطبّق، فشل = تراجع) |
| VI. طويل المدى | ✅ يزيل الاعتماد على رصيد Netlify نهائياً |

## خطوات التحويل (Runbook)

| # | الخطوة | المنفّذ |
|---|---|---|
| 1 | دمج كود FR-001..FR-003 (لا أثر قبل وجود `DATABASE_URL`) | Claude/GLM |
| 2 | إنشاء Neon من Vercel ← Storage ← Neon (Free) وربطه بمشروع halaqat-tahfeez للإنتاج فقط | المالك (إنشاء حساب ممنوع على الوكيل) |
| 3 | إضافة سرّ `DATABASE_URL` في GitHub ← Settings ← Secrets | المالك |
| 4 | نافذة صيانة: `pg_dump` من Netlify ← `pg_restore` إلى Neon (أوامر جاهزة في quickstart.md) | المالك |
| 5 | `migrate.mjs --baseline` ثم `verify-copy` (عدد الصفوف) | المالك/الإجراء |
| 6 | إعادة نشر Vercel للإنتاج (يلتقط `DATABASE_URL`) + فحص كل الأدوار | Claude |
| 7 | تشغيل `db-migrate` → `status` ثم `apply` لتطبيق M1 (بموافقة) | المالك يضغط |
| 8 | ترقية الإنتاج لنسخة main الأحدث (الدفعتان 2 و3) | Claude |
| 9 | بعد أسبوعين: إيقاف بناء Netlify، ثم قرار حذف قاعدته | المالك |

## التراجع

حتى الخطوة 6: حذف `DATABASE_URL` من Vercel يعيد التطبيق لقاعدة Netlify فوراً (FR-001 احتياطي). بعد بدء الكتابة على Neon، التراجع يعني فقد كتابات ما بعد التحويل — لذلك نتحقّق جيداً في الخطوة 6 قبل فتح الاستخدام.

## البنية

```text
web/lib/db.ts                      # db(): getDatabase({ connectionString: DATABASE_URL ?? NETLIFY_DB_URL })
web/app/api/teacher/join-info/route.ts   # يستعمل db()
web/lib/migrations.ts (+ .test.ts) # منطق نقي: قراءة الملفات، ترتيب، حساب المعلّق
web/scripts/migrate.mjs            # --status | --baseline | --apply
web/scripts/verify-copy.mjs        # يقارن عدد الصفوف بين قاعدتين
.github/workflows/db-migrate.yml   # workflow_dispatch: status | apply
specs/004-.../quickstart.md        # أوامر النقل جاهزة للمالك
```
