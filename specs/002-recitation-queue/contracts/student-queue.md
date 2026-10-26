# Contract: طابور التسميع — جهة الطالب

عام: **Auth** `currentStudent()` (حلقته من جلسته)؛ CSRF مركزي؛ إن كان الطابور غير مفعّل لحلقته ⇒ 404 `QUEUE_DISABLED`.
**Rate limits**: مسح `queue-scan:${halaqahId}:${studentId}` — 30 / 10 دقائق (يكبح تخمين الرموز)؛ استطلاع `queue-me:${halaqahId}:${studentId}` — 1500/ساعة.

---

## GET `/api/student/queue?v=<version>`

حالتي في الجلسة المفتوحة (يُنفّذ `closeIfExpired` أولاً).

- **200 — لا جلسة**: `{ "sessionOpen": false }`
- **200 — جلسة مفتوحة، لم أمسح**: `{ "sessionOpen": true, "version": 17, "entry": null }`
- **200 — لدي دور**:

```json
{
  "sessionOpen": true,
  "version": 17,
  "entry": {
    "number": 4,
    "status": "waiting",
    "ahead": 3,
    "attempt": 1,
    "planned": { "label": "الملك ١–٣٠" },
    "calledBy": null,
    "canReady": false
  }
}
```
- `status`: `waiting | called | reviewing | done | not_heard`.
- `status === "called"` ⇒ `calledBy: { "name": "الشيخ خالد" }` (واجهة: «تفضّل عند الشيخ خالد»).
- `status === "reviewing"` ⇒ `canReady: true` (زر «جاهز»).
- `status === "done"` ⇒ `outcome: "mastered" | "repeat_more"`, `summary: "الملك ١–٣٠"` و`repeatMore: boolean`.
- `v` مطابق لـ`version` ⇒ `{ "sessionOpen": true, "unchanged": true }`.
- الطالب لا يرى أسماء الآخرين ولا أرقامهم (FR-011؛ خصوصية).

## POST `/api/student/queue/scan`

الطالب مسح الرمز.

- **Request**: `{ "c": "<code>", "planned"?: { "hifz"?: {from,to}, "hifzPages"?: {from,to}, "review"?: [{from,to}] } }`
- **التحقق بالترتيب**: (1) تنسيق الرمز (`isValidQueueCodeFormat`) ← (2) البحث عن حلقة الرمز ← (3) مقارنتها بحلقة الطالب (غير ذلك **403** `WRONG_HALAQAH` «هذا الرمز ليس لحلقتك») ← (4) تفعيل الطابور ← (5) `closeIfExpired` ثم جلسة مفتوحة وإلا **409** `{ "code": "NO_OPEN_SESSION", "error": "لا توجد جلسة تسميع مفتوحة الآن" }` ← (6) إدراج الدور/إرجاع القائم.
- **200**:

```json
{ "ok": true, "number": 4, "ahead": 3, "status": "waiting", "alreadyScanned": false, "attendance": "present" }
```
  - مسح متكرر ⇒ `alreadyScanned: true` بالرقم نفسه (FR-003) بلا تغيير في الحالة؛ إن كان `reviewing` يُعاد للطابور (`waiting`) ويرجع `status: "waiting"` (مسح جديد = جاهز).
  - `done` ⇒ يرجع `status: "done"` دون إنشاء دور جديد.
  - `attendance`: حالة اليوم الفعلية (قد تكون `late/excused` إن حدّدها المعلّم قبلاً؛ المسح لا يطغى على قرار المعلّم).
- **خطأ آخر**: 400 رمز مشوّه؛ 404 رمز غير معروف (رسالة موحّدة «الرمز غير صالح» لعدم تمييز المنتهي من الخاطئ)؛ 429.
- **أثر**: `recordQrCheckin(halaqahId, studentId, date, "queue")`.

## POST `/api/student/queue/ready`

بعد «يرجع يراجع»: زر «جاهز».

- **Request**: بلا جسم.
- **200**: `{ "ok": true, "status": "waiting", "ahead": 2 }` — الدور يعود للطابور بـ`queued_at = now()`.
- **409** `{ "code": "NOT_REVIEWING" }` إن لم يكن الدور `reviewing`. تكرار الضغط وهو `waiting` ⇒ 200 بلا تغيير.

## PATCH `/api/student/queue/planned`

تحديد/تعديل ما سيسمّعه (اختياري) قبل المناداة.

- **Request**: `{ "planned": { "hifz"?: {...}, "hifzPages"?: {...}, "review"?: [...] } | null }` — نفس التحقق (`parseAyahRange`/`parseReviewSegments`/`parseHifzPagesInput`)؛ أقصى حجم JSON ٢ كيلوبايت.
- **200**: `{ "ok": true, "label": "الملك ١–٣٠" }`
- **409** `ENTRY_LOCKED` إن كان الدور `called` أو `done` (لا تعديل بعد المناداة).

---

## صفحة الوجهة `/student/queue`

- `?c=<code>`: تقرأ الرمز مرة واحدة ثم `history.replaceState` لإزالته من شريط العنوان (نمط `/student/checkin`). بوابة الطالب تعرض تسجيل الدخول وتعود للصفحة نفسها.
- تعرض: رقم الطالب بخط كبير، «قبلك N»، الحالة، زر «جاهز» عند `reviewing`، حقل «ما سأسمّعه» اختياري، وتتحدّث تلقائياً كل ٤ ثوانٍ (`?v=`)، ويتوقف الاستطلاع عند `done`/`not_heard` أو إغلاق الجلسة.
- حالات الخطأ: «لا توجد جلسة تسميع مفتوحة الآن»، «هذا الرمز ليس لحلقتك»، «الرمز غير صالح».
