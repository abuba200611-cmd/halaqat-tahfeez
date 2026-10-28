# المهام: نقل قاعدة البيانات من Netlify

**المدخلات**: [spec.md](./spec.md)، [plan.md](./plan.md). الاختبارات أولاً للمنطق النقي.

## المرحلة 1: الكود (لا أثر قبل وجود DATABASE_URL)

- [x] T001 `web/lib/db.ts`: `db()` يمرّر `connectionString: process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL` إلى `getDatabase` (مع إبقاء الخطأ الواضح عند غيابهما). اختبار يتحقّق من الأولوية.
- [x] T002 `app/api/teacher/join-info/route.ts`: استبدال `getDatabase()` المباشر بـ `db()`.
- [x] T003 اختبارات `web/lib/migrations.test.ts` أولاً: ترتيب معجمي للمجلدات، حساب المعلّق من قائمة المطبّق، رفض اسم مكرر، تجاهل ما ليس مجلداً فيه `migration.sql`.
- [x] T004 `web/lib/migrations.ts` حتى تنجح T003.
- [x] T005 `web/scripts/migrate.mjs`: ينشئ `schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())` بـ IF NOT EXISTS؛ `--status`، `--baseline` (يسجّل كل الموجود دون تشغيل، ويرفض إن كان الجدول غير فارغ إلا مع `--force`)، `--apply` (كل ملف في BEGIN/COMMIT، يتوقف عند أول فشل). لا يطبع سلسلة الاتصال أبداً.
- [x] T006 `web/scripts/verify-copy.mjs`: يقرأ `SOURCE_DB_URL` و`TARGET_DB_URL` ويطبع جدولاً بأسماء الجداول وعدد الصفوف في كلٍّ والفرق؛ يخرج برمز 1 عند أي فرق.
- [x] T007 `.github/workflows/db-migrate.yml`: `workflow_dispatch` بمدخل `action` (status|apply)، Node 22، `npm ci` في web/، يشغّل `migrate.mjs` بسرّ `DATABASE_URL`.
- [x] T008 `specs/004-move-database-off-netlify/quickstart.md`: أوامر pg_dump/pg_restore وverify وbaseline جاهزة للنسخ (بلا أي قيمة سرّية)، وخطوات Vercel/GitHub بالصور النصية.
- [x] T009 البوابات الأربع.

## المرحلة 2: التحويل (المالك + Claude، حسب Runbook في plan.md)

- [ ] T010 المالك: إنشاء Neon وربطه بـ Vercel (إنتاج فقط) + سرّ GitHub.
- [ ] T011 المالك: نافذة الصيانة — dump/restore ثم verify ثم baseline.
- [ ] T012 Claude: إعادة نشر Vercel وفحص كل الأدوار.
- [ ] T013 المالك: `db-migrate` → apply (M1) بموافقة.
- [ ] T014 Claude: ترقية الإنتاج لآخر main.

## المرحلة 3: الإغلاق

- [ ] T015 بعد أسبوعين: إيقاف بناء Netlify؛ قرار حذف قاعدته (المالك).
