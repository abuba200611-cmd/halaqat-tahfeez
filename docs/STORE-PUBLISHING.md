# نشر «السلام — MOS» على المتاجر

تطبيق الويب جاهز كـ PWA قابل للتثبيت (المانيفست `/manifest.webmanifest`، عامل الخدمة `/sw.js`، صفحة `/offline`).
هذا الدليل لما تفعله أنت بنفسك: إنشاء حسابات المطوّر، والبناء، والرفع. لم يُنشأ أي حساب نيابةً عنك.

> الشرط الأول لكل شيء: الموقع منشور على نطاق HTTPS ثابت (مثلاً `https://mos.example`). استبدله بنطاقك أدناه.

## التكاليف

| المتجر | التكلفة | ملاحظات |
|---|---|---|
| Google Play | 25$ مرة واحدة | حساب مطوّر + تحقّق هوية؛ الحسابات الشخصية الجديدة تتطلب اختباراً مغلقاً (12 مختبِراً لمدة 14 يوماً) قبل الإنتاج، وتتغيّر الشروط فراجعها وقت التسجيل |
| App Store | 99$ سنوياً | Apple Developer Program، ويلزم جهاز Mac مع Xcode للبناء والرفع |

## الأصول والمتطلبات المشتركة

- **رابط سياسة الخصوصية:** `https://mos.example/privacy` (الصفحة موجودة وهي **مسودة**؛ راجعها واعتمدها قبل التقديم).
- **أيقونة المتجر 512×512:** `web/public/brand/icons/icon-512.png`. الأيقونة القابلة للقص (maskable): `icon-512-maskable.png`.
- **لقطات الشاشة:** من الموقع نفسه بعد تسجيل الدخول بحسابات تجريبية (لا بيانات طلاب حقيقية).
  - Google Play: 2 إلى 8 لقطات للجوال (نسبة 16:9 أو 9:16، الضلع بين 320 و3840 بكسل). مطلوب أيضاً **Feature graphic** بحجم 1024×500.
  - App Store: لقطات لآيفون 6.9" (مثل 1320×2868) و6.5"، ولآيباد 13" إن دعمتَ الآيباد.
- **الوصف:** عربي، قصير وطويل، من نص الصفحة الترحيبية.
- **حساب تجريبي للمراجعين:** أنشئ حساب معلّم/مدير جامع تجريبياً وضعه في ملاحظات المراجعة (انظر أدناه).
- **تصنيف المحتوى والفئة العمرية:** تعليم / إنتاجية. والتطبيق يخدم قاصرين فأجب أسئلة بيانات الأطفال بصدق.
- **نموذج سلامة البيانات (Data safety / App Privacy):** البيانات المجمَّعة: الاسم، رقم الجوال، سجلات الحضور والحفظ، الرسائل. لا بيع ولا إعلانات (متسقة مع `/privacy`).

---

## أولاً: Google Play عبر TWA (Bubblewrap)

TWA يغلّف موقعك في تطبيق أندرويد يفتحه بلا شريط متصفح، بشرط ربط الموقع بالتطبيق عبر Digital Asset Links.

### 1) التجهيز
```bash
node --version        # 18 أو أحدث
npm i -g @bubblewrap/cli
```
يطلب Bubblewrap تثبيت JDK 17 وAndroid SDK عند أول تشغيل؛ اقبل التنزيل التلقائي.

### 2) تهيئة المشروع
```bash
mkdir mos-android && cd mos-android
bubblewrap init --manifest=https://mos.example/manifest.webmanifest
```
عند الأسئلة:
- **Application ID (package name):** `sa.alsalam.mos` (هذا هو المعرّف الافتراضي في الكود؛ إن غيّرتَه غيّر `ANDROID_PACKAGE_NAME` في `web/lib/pwa.ts` أيضاً).
- **Signing key:** دَع Bubblewrap ينشئ مفتاحاً جديداً (`android.keystore`). **احتفظ بنسخة احتياطية من الملف وكلمة مروره خارج المستودع وإلى الأبد** — فقدانه يعني عدم القدرة على تحديث التطبيق.
- اترك بقية القيم من المانيفست.

### 3) البناء
```bash
bubblewrap build
```
يخرج `app-release-bundle.aab` (للرفع إلى Play) و`app-release-signed.apk` (للتجربة).
لتجربة الـAPK على جهازك: `bubblewrap install`.

### 4) استخراج بصمة SHA-256 وربط الموقع
```bash
bubblewrap fingerprint
# أو: keytool -list -v -keystore android.keystore -alias android
```
انسخ قيمة `SHA256` بصيغة `AA:BB:CC:...` (32 زوجاً).

> إن فعّلتَ **Play App Signing** (الافتراضي)، تتغير الشهادة النهائية: بعد أول رفع افتح Play Console ← **Test and release ← App signing** وانسخ **SHA-256 لشهادة توقيع التطبيق** (App signing key certificate). ضع **كلتا البصمتين** (مفتاح الرفع ومفتاح Play) مفصولتين بفاصلة.

أضف المتغير في بيئة الاستضافة (لا يوضع في المستودع):
```
ANDROID_ASSETLINKS_SHA256=AA:BB:...:FF
# أو عدة بصمات: AA:...:FF,11:22:...:99
```
ثم أعد النشر. المسار `/.well-known/assetlinks.json` **يرجع 404 ما دام المتغير غير مضبوط أو بصيغة غير صالحة**، وعند ضبطه يخدم:
```json
[{"relation":["delegate_permission/common.handle_all_urls"],
  "target":{"namespace":"android_app","package_name":"sa.alsalam.mos","sha256_cert_fingerprints":["AA:BB:..."]}}]
```
تحقق: افتح `https://mos.example/.well-known/assetlinks.json` أو استخدم أداة Google: <https://developers.google.com/digital-asset-links/tools/generator>.
إن لم يتحقق الربط ظهر شريط المتصفح أعلى التطبيق.

### 5) الرفع في Play Console
1. أنشئ حساب مطوّر (25$) وتحقّق من هويتك.
2. **Create app** ← اللغة العربية، تطبيق، مجاني.
3. املأ: صفحة المتجر، **رابط الخصوصية**، **Data safety**، **Content rating**، **Target audience** (انتبه: خدمة الأطفال تفرض متطلبات إضافية — اختر الفئة العمرية بعناية).
4. **Testing ← Closed testing** ارفع `.aab`، وأضف المختبِرين (حسب شروط حسابك).
5. بعد اجتياز الاختبار المطلوب: **Production ← Create release** ← أرسل للمراجعة.

---

## ثانياً: Apple App Store

Apple لا تقبل مجرد رابط لموقع؛ يجب أن يكون التطبيق فيه قيمة أصلية (Guideline 4.2). خياران:

### الخيار أ: Capacitor (الموصى به — مرونة أكبر)
```bash
mkdir mos-ios && cd mos-ios
npm init -y && npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "السلام" sa.alsalam.mos --web-dir=www
```
في `capacitor.config.ts` اضبط الخادم ليشير للموقع المنشور:
```ts
server: { url: "https://mos.example", cleartext: false }
```
ثم:
```bash
mkdir www && echo "<html></html>" > www/index.html
npx cap add ios
npx cap open ios       # يفتح Xcode
```
في Xcode: اختر Team (حساب المطوّر)، ضع الأيقونة 1024×1024 (بلا شفافية)، فعّل **Push Notifications** capability إن أردت إشعارات أصلية، ثم **Product ← Archive ← Distribute App ← App Store Connect**.
لمجاراة معيار 4.2 أضف قيمة أصلية بسيطة (إشعارات أصلية عبر `@capacitor/push-notifications`، مشاركة، شاشة بداية...).

### الخيار ب: PWABuilder (أسرع)
1. ادخل <https://www.pwabuilder.com> وأدخل `https://mos.example`.
2. اختر **Package for stores ← iOS** وحمّل المشروع.
3. افتحه في Xcode على Mac واتبع تعليمات README المرفق (Team، Bundle ID، Archive).

### الرفع في App Store Connect
1. سجّل في Apple Developer Program (99$/سنة).
2. **My Apps ← New App**: Bundle ID `sa.alsalam.mos`، اللغة الأساسية العربية.
3. املأ **App Privacy**، **رابط سياسة الخصوصية**، اللقطات، الوصف، التصنيف العمري (Kids Category لها اشتراطات صارمة — لا تختَرها ما لم تلتزم بها).
4. اربط البناء المرفوع من Xcode ← **Submit for Review**.

---

## ملاحظات للمراجعين (انسخها في خانة Review Notes)

```
تطبيق «السلام — MOS» نظام لإدارة حلقات تحفيظ القرآن في المساجد: تسجيل الحضور والحفظ والمراجعة، والتواصل بين المعلّم وولي الأمر والطالب.
التطبيق يتطلب حساباً. بيانات الدخول التجريبي:
  - معلّم: <الهاتف/البريد> / <كلمة المرور>
  - مدير جامع: <...>
  - ولي أمر: <...>
البيانات في الحسابات التجريبية وهمية. لا مشتريات داخل التطبيق ولا إعلانات. سياسة الخصوصية: https://mos.example/privacy
```

> أنشئ الحسابات التجريبية على بيئة الإنتاج نفسها قبل التقديم، وتأكد أنها تعمل (تعطّل الدخول أكثر سبب لرفض المراجعة).

## قائمة فحص قبل التقديم

- [ ] الموقع على HTTPS ثابت، و`/manifest.webmanifest` و`/offline` و`/privacy` تعمل.
- [ ] راجعتَ **مسودة** `/privacy` واعتمدتها (أضف وسيلة تواصل صريحة وبيانات الجهة المالكة).
- [ ] `ANDROID_ASSETLINKS_SHA256` مضبوط وتحقق منه `assetlinks.json` (أندرويد).
- [ ] اللقطات وFeature graphic جاهزة.
- [ ] حسابات المراجعة التجريبية تعمل.
- [ ] مفتاح التوقيع (`android.keystore`) محفوظ في مكان آمن.

## ملاحظات تقنية

- عامل الخدمة يُسجَّل في بيئة الإنتاج فقط. لتنظيف تطوير محلي قديم: DevTools ← Application ← Service Workers ← Unregister.
- لتغيير سلوك التخزين المؤقت ارفع `CACHE_VERSION` في `web/public/sw-rules.js` (يحذف العامل الجديد الذاكرات القديمة تلقائياً).
- لا يُخزَّن أي مسار `/api/*` ولا صفحات HTML موثَّقة؛ عند انقطاع الشبكة تظهر صفحة `/offline` فقط.
- أيقونات المانيفست تُولَّد بـ `node web/scripts/generate-brand-icons.mjs` من `logo.png` كما هو.
