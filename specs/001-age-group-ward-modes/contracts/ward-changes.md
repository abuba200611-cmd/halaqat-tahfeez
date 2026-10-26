# Contract: تعديلات على مسارات الورد القائمة

> لا تغيير في `/api/v1` ولا في حمولات webhooks. التعديلات إضافية أو شرطية بالفئة.

## POST `/api/wards` (الطالب) — إضافات

- **جديد في الطلب**: `hifzPages: { "from": 502, "to": 504 }` بديلاً لـ`hifz` (لحلقات `secondary`/`university`). يُحوَّل إلى نطاق آيات عبر `ayahRangeOfPageRange` ثم يمرّ على `parseAyahRange` فيُخزَّن كأي ورد عادي. `hifz` و`hifzPages` معاً ⇒ 400. يبقى `hifz` يعمل في كل الفئات.
- **حارس التكرار (FR-005)**: إن وُجد لنفس الطالب والتاريخ ورد `recorded_via='teacher'` ⇒ **409** `{ "code": "DUPLICATE_TODAY", "existing": { ... } }` ما لم يُرسل `confirmDuplicate: true`. عدا ذلك لا تغيير.
- **الحالة الابتدائية**: `new` دائماً (تُحدَّد بـ`initialStatusFor`)؛ لا اعتماد تلقائي لورد الطالب في أي فئة.

## PATCH `/api/wards` (المعلّم) — إضافات

- `status: "needs_revision"` على ورد `approved`: يُسمح فقط إن كان `recorded_via ∈ {teacher, queue}` (عبر `reopenApprovedWard`)؛ غير ذلك **404** كما اليوم `الورد غير موجود أو لا يمكن تعديله`. الملاحظة إلزامية.
- بعد `approved`: `awardPointsForApproval` (إن كانت النقاط مفعّلة، وإلا تجاهل صامت).
- كتلة الإشعارات تُستدعى من `notifyWardDecision()` (سلوك مطابق حرفياً للحالي).

## GET `/api/wards/mine` و`GET /api/student/progress` (الطالب) — إضافات

```json
{ "stage": "secondary", "unit": "page_wajh", "points": { "enabled": false } }
```
- عند التفعيل: `points: { "enabled": true, "balance": 12, "ledger": [ آخر 20 حركة ] }`. الوحدة للعرض فقط والبيانات كما هي.
- كل ورد في القائمة يحمل `recordedVia` (`student|teacher|queue`) واسم المعلّم الذي سجّله عند اللزوم.

## GET `/api/wards` (المعلّم) — إضافة

- كل عنصر: `recordedVia`, `recordedByTeacherName`. و`reviewTrackConfig.enabled` يعكس الفئة (US6).

## GET `/api/parent/child` — إضافات

- `wards[i].recordedVia`، `wards[i].teacherNote` (= `note`/`review_note` الموجودتان)، و`points` للابتدائي. لا تُعرض بيانات طلاب آخرين (الربط `parent_children` كما هو).
