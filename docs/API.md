# واجهة برمجة الجامع (API v1) والويب هوكس

واجهة **قراءة فقط** لبيانات جامعك، وويب هوكس موقَّعة. الميزة مغلقة افتراضياً؛ تُفعَّل لكل جامع من
الإعدادات (ميزة «التكاملات وواجهة البرمجة»، المفتاح `integrations`). وهي مغلقة → كل المسارات تردّ `404`.

## المصادقة

أنشئ مفتاحاً من لوحة الجامع ← «التكاملات وAPI». يظهر المفتاح **مرة واحدة** فقط (نخزّن تجزئته SHA-256 فقط).
الصيغة: `mos_<8 hex>_<64 hex>`. أرسله في كل طلب:

```
Authorization: Bearer mos_1a2b3c4d_...
```

المفتاح مرتبط بجامع واحد؛ كل ما تعيده الواجهة محصور بذلك الجامع، ولا يوجد معامل لاختيار جامع.
اسحب المفتاح من اللوحة فيتوقف فوراً.

## النطاقات (Scopes)

| النطاق | المسار |
|---|---|
| `students:read` | `GET /api/v1/students` |
| `halaqat:read` | `GET /api/v1/halaqat` |
| `attendance:read` | `GET /api/v1/attendance` |
| `progress:read` | `GET /api/v1/progress` |

## الترقيم

كل القوائم: `?limit=` (١–٢٠٠، الافتراضي ٥٠) و`?cursor=` (مؤشر معتم). الرد:

```json
{ "data": [ ... ], "next_cursor": "WzEsIjEyIl0" }
```

`next_cursor = null` يعني آخر صفحة. مرّر القيمة كما هي في الطلب التالي.

## المسارات

### `GET /api/v1/halaqat`
`{ "id": 3, "name": "حلقة الفجر", "created_at": "2026-09-01T08:00:00.000Z" }`

### `GET /api/v1/students`
`{ "id": "s_12", "halaqah_id": 3, "name": "…", "active": true }` — الطلاب غير المحذوفين فقط.
لا أسماء مستخدمين ولا كلمات مرور ولا هواتف ولا بيانات أولياء أمور.

### `GET /api/v1/attendance`
مرشّحات اختيارية: `from`, `to` (`YYYY-MM-DD`)، `halaqah_id`.
`{ "halaqah_id": 3, "student_id": "s_12", "date": "2026-10-20", "status": "present" }`
الحالات: `present | late | excused | absent`. بلا ملاحظات نصية.

### `GET /api/v1/progress`
المرشّحات نفسها. أوراد الحفظ والمراجعة:
```json
{ "id": 91, "halaqah_id": 3, "student_id": "s_12", "date": "2026-10-20", "status": "approved",
  "hifz": { "from_surah": 2, "from_ayah": 1, "to_surah": 2, "to_ayah": 5 },
  "review": { "from_surah": null, "from_ayah": null, "to_surah": null, "to_ayah": null } }
```

## مثال

```bash
curl -H "Authorization: Bearer $MOS_KEY" \
  "https://<your-host>/api/v1/attendance?from=2026-10-01&limit=100"
```

## الأخطاء

الشكل: `{ "error": { "code": "…", "message": "…" } }`

| الحالة | code | المعنى |
|---|---|---|
| 400 | `bad_request` | معامل غير صالح (limit/cursor/تاريخ) |
| 401 | `unauthorized` | مفتاح مفقود أو غلط أو مسحوب |
| 403 | `insufficient_scope` | المفتاح لا يملك نطاق المسار |
| 404 | `not_found` | الميزة غير مفعّلة لهذا الجامع |
| 429 | `rate_limited` | تجاوز الحدّ: ١٢٠ طلب/دقيقة لكل مفتاح، و٣٠ محاولة مصادقة فاشلة/دقيقة لكل IP (`Retry-After`) |

## الويب هوكس

تضيف نقطة (رابط **https** عام، منفذ 443) من اللوحة، وتحصل على سرّ توقيع `whsec_…` **يُعرض مرة واحدة**.
الأحداث: `ping` (زرّ «اختبار»)، و`student.created`, `attendance.recorded`, `progress.recorded` محجوزة للمرحلة
التالية (النقطة بلا اختيار أحداث تستقبل الكل). التسليم من صندوق صادر مع إعادة محاولة بتراجع (١د، ٥د، ٣٠د، ٢س، ٦س)
وبحدّ ٦ محاولات، ويعمل ضمن الـcron اليومي القائم. النجاح = أي `2xx` خلال ٨ ثوانٍ؛ التحويلات (3xx) تُعدّ فشلاً.

حماية SSRF: يُرفض أي رابط يحلّ إلى عنوان خاص أو loopback أو link-local أو metadata (IPv4/IPv6).

### الطلب

```
POST <your-url>
Content-Type: application/json
X-Salam-Event: ping
X-Salam-Delivery: 42
X-Salam-Signature: t=1766000000,v1=<hex>

{"id":"42","event":"ping","created_at":"…","data":{…}}
```

### التحقق من التوقيع

`v1 = HMAC-SHA256(secret, "<t>.<الجسم الخام>")` بالـhex. احسبه على **الجسم الخام** قبل أي تحليل JSON،
قارنه بزمن ثابت، وارفض إن مرّ أكثر من ٥ دقائق على `t`.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, header, rawBody) {
  const p = Object.fromEntries(header.split(",").map((s) => s.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${p.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected), b = Buffer.from(p.v1 ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

اجعل المعالج idempotent باستخدام `X-Salam-Delivery`؛ قد يصلك الحدث نفسه أكثر من مرة.

## تصدير CSV

من اللوحة: الطلاب، الحضور، التقدّم (بأسماء الطلاب، لمدير الجامع فقط، حتى ٥٠ ألف صف). الخلايا النصية التي
تبدأ بـ `=` `+` `-` `@` أو Tab/CR تُسبق بـ `'` لمنع حقن الصيغ.

## الموصّلات

كلاسيرا وخيركم وجداول جوجل: بطاقات فقط حالياً، حالتها «يتطلب بيانات الربط من المزوّد» — غير منفَّذة.
