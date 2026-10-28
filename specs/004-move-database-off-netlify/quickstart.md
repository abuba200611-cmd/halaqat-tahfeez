# دليل التحويل السريع — نقل قاعدة البيانات من Netlify إلى Neon

أوامر جاهزة للنسخ لنافذة الصيانة (القرارات D1–D4 في [spec.md](./spec.md)).
كل القيم بين `<…>` رموز بديلة — عوّضها بالقيم الحقيقية ولا تشاركها مع أي أحد
ولا تلصقها في محادثة أو كومت. الترتيب هنا هو ترتيب التنفيذ نفسه.

## 0) المتطلبات (مرة واحدة، قبل النافذة)

- **Node 22 أو أحدث**: تحقّق بـ `node --version`.
- **أدوات عميل Postgres** (`pg_dump` و`pg_restore`): تثبّت مع PostgreSQL
  (تحتاج حزمة «Command Line Tools» فقط لا السيرفر). تحقّق بـ `pg_dump --version`
  — استخدم نسخة ≥ نسخة قاعدة Netlify.
- **قيمتان جاهزتان عندك**: سلسلة اتصال قاعدة Netlify (رمزها `<NETLIFY_DB_URL>`)
  وسلسلة Neon الجديدة (رمزها `<NEON_DB_URL>`).

## 1) إنشاء قاعدة Neon من Vercel (مرة واحدة — D1)

1. افتح [vercel.com](https://vercel.com) ← مشروع **halaqat-tahfeez**.
2. تبويب **Storage** (القائمة العلوية للمشروع) ← **Create** ← اختر **Neon**.
3. اختر خطة **Free** (0.5GB — القاعدة الحالية 17MB) ← **Create database**
   (سمّها مثلاً `neondb`).
4. بعد الإنشاء: **Connect to project** واختر بيئة **Production** فقط —
   يُضاف متغيّر `DATABASE_URL` تلقائياً لمتغيرات بيئة المشروع، فلا تنسخ
   أحدٌ أي سرّ يدوياً (تحقّق منه في Settings ← Environment Variables — هذه
   قيمته هي `<NEON_DB_URL>`، انسخها فستحتاجها في الخطوات التالية).

> إشارة: التطبيق يقرأ `DATABASE_URL` أولاً ثم `NETLIFY_DB_URL` احتياطاً،
> فلا يتغيّر شيء قبل إنشاء/إضافة المتغيّر — الخطوات 1–6 آمنة بأي ترتيب وقت.

## 2) سرّ GitHub (مرة واحدة)

1. افتح مستودع GitHub ← **Settings** ← **Secrets and variables** ← **Actions**.
2. **New repository secret**: الاسم `DATABASE_URL` والقيمة `<NEON_DB_URL>` نفسها.

هذا ما يستعمله مسار التشغيل اليدوي `db-migrate` لاحقاً (الخطوة 7).

## 3) نافذة الصيانة — نسخ البيانات (D2: أنت تنفّذ، ~15 دقيقة)

أحصل على `<NETLIFY_DB_URL>`: لوحة Netlify ← الموقع ← **Database** ←
سلسلة الاتصال (Connection string). نفّذ من أي مجلد (Git Bash أو PowerShell —
الأوامر نفسها):

```bash
# 1) نسخة احتياطية من قاعدة Netlify (صيغة custom، بلا مالكيات ولا صلاحيات)
pg_dump --format=custom --no-owner --no-privileges "<NETLIFY_DB_URL>" --file=halaqat.dump

# 2) استرجاعها داخل قاعدة Neon الفارغة
pg_restore --no-owner --no-privileges --dbname="<NEON_DB_URL>" halaqat.dump
```

> `<NEON_DB_URL>` يجب أن تكون فارغة (قاعدة أنشأتها للتوّ) — الاسترجاع فوق
> بيانات قائمة قد يفشل أو يكرّر. حجم القاعدة 17MB فالأمران يدقائق.

## 4) التحقّق من النسخ (قبل أي خطوة أخرى)

من جذر المستودع (مجلد `web/` يجب أن فيه `node_modules` — `npm ci` إن لم تكن):

Git Bash:

```bash
cd web
SOURCE_DB_URL="<NETLIFY_DB_URL>" TARGET_DB_URL="<NEON_DB_URL>" node scripts/verify-copy.mjs
```

PowerShell:

```powershell
cd web
$env:SOURCE_DB_URL = "<NETLIFY_DB_URL>"; $env:TARGET_DB_URL = "<NEON_DB_URL>"
node scripts/verify-copy.mjs
```

النتيجة المطلوبة: سطر **«تطابق تام: N جدولاً بنفس عدد الصفوف»** ورمز خروج 0.
أي فرق أو جدول مفقود ⇒ لا تُكمل، راجع رسالة الخطأ وأعد الاسترجاع.

> شغّل التحقّق **قبل** baseline التالي — بعده يُنشأ جدول `schema_migrations`
> في الهدف وحده فيظهر فرقاً زائفاً.

## 5) تحديد آخر مايقريشن طُبِّق فعلاً ثم تسجيل الأساس (baseline)

> **تنبيه مهم (اكتُشف 2026-10-28)**: آخر نشر ناجح لـ Netlify (2026-10-17، commit
> `8c3acdc`) كان يحوي المايقريشنز حتى `20261101000000_permits_eval` فقط. ما بعده
> (14 مايقريشن: whatsapp … integrations، ثم M1) **قد لا يكون مطبّقاً** على قاعدة
> الإنتاج. لذلك لا نفترض حدّاً — نقرأه من القاعدة المنقولة نفسها.

### 5.أ) اقرأ سجل Netlify للمايقريشنز من النسخة المنقولة (قراءة فقط)

```bash
psql "<NEON_DB_URL>" -c "SELECT table_schema, table_name FROM information_schema.tables WHERE table_name ILIKE '%migration%' ORDER BY 1,2;"
```

ثم اعرض محتوى الجدول الظاهر (غالباً اسمه فيه migrations) مرتّباً، مثلاً:

```bash
psql "<NEON_DB_URL>" -c "SELECT * FROM <schema>.<table> ORDER BY 1 DESC LIMIT 20;"
```

انسخ **الناتج فقط** (أسماء المايقريشنز، لا رابط القاعدة) وأرسله لـ Claude. منه
نحدّد `<آخر-مطبّق>` = آخر اسم مسجّل مطبّقاً على Netlify.

### 5.ب) تسجيل الأساس حتى ذلك الحدّ فقط

```bash
DATABASE_URL="<NEON_DB_URL>" node --experimental-strip-types scripts/migrate.mjs --status
DATABASE_URL="<NEON_DB_URL>" node --experimental-strip-types scripts/migrate.mjs --baseline --to <آخر-مطبّق>
```

(في PowerShell: `$env:DATABASE_URL = "<NEON_DB_URL>"` ثم نفّذ الأمرين بلا البادئة.)

- `--baseline --to <اسم>` يسجّل مطبّقاً كل مايقريشن اسمه يرتّب ≤ الاسم المعطى
  **فقط**، دون تشغيل أي ملف، ويرفض لو وجد السجل غير فارغ إلا مع `--force`.
  بعده يطبع الحالة تلقائياً — المعلّق = كل ما لم يطبّقه Netlify (M1 على الأقل).

> **تحذير**: تسجيل مايقريشن «مطبّقاً» وهو لم يُطبَّق يجعله لا يعمل أبداً ويكسر
> الإنتاج. لا تخمّن الحدّ — خذه من 5.أ. كل المعلّق يُطبَّق لاحقاً عبر GitHub
> Action (الخطوة 7: status ثم apply) بموافقة صريحة.

## 6) إعادة نشر Vercel وفحص الأدوار

1. Vercel ← halaqat-tahfeez ← **Deployments** ← آخر نشر للإنتاج ← قائمة
   ⋯ ← **Redeploy** (لازم — `DATABASE_URL` أُضيف بعد آخر نشر تلقائي).
2. افتح الموقع وافحص صفحات كل الأدوار (SC-002): معلّم، طالب، وليّ أمر،
   مدير جامع، جمعية، ولوحة المطوّر `/dev`.
3. حتى هذه الخطوة التراجع فوري: احذف `DATABASE_URL` من Vercel وأعد النشر
   فيعود التطبيق لقاعدة Netlify.

## 7) تطبيق M1 عبر GitHub Actions (بموافقتك — زر لا نشر Netlify)

1. GitHub ← المستودع ← تبويب **Actions** ← مسار **db-migrate** ← **Run workflow**.
2. اختر فرع `main` وaction = **status** أولاً (تشغيل تجريبي يعرض المعلّق فقط).
3. إذا كان المعلّق كما تتوقّع: كرّر بـ action = **apply** — كل مايقريشن في
   معاملة، ويتوقف عند أول فشل بلا أثر جزئي.

## 8) بعد أسبوعين (D4)

- إيقاف بناء Netlify على المستودع (Netlify ← Site settings ← Build & deploy).
- قاعدة Netlify تبقى نسخة احتياطية للقراءة حتى قرار الحذف.
- احذف ملف `halaqat.dump` من جهازك بعد نجاح التحقّق ومرور الأيام الأولى.

## ملاحظات أمان

- لا تطبع ولا تلصق أي سلسلة اتصال في أي مكان يُحفَظ (محادثات، issues، كومتات).
- السكربتات أعلاه تقرأ قيمها من البيئة فقط ولا تطبعها؛ رسائلها تذكر **اسم**
  المتغيّر لا قيمته.
- ما في هذا الملف رموز بديلة فقط (`<NETLIFY_DB_URL>`، `<NEON_DB_URL>`) — لا قيمة حقيقية واحدة.
