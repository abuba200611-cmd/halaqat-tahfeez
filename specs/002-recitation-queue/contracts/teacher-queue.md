# Contract: طابور التسميع — جهة المعلّم (مسمِّع / مشرف)

عام لكل المسارات:
- **Auth**: `currentTeacher()`؛ الحلقة من الجلسة فقط. معرّفات الأدوار (`entries/[id]`) يُتحقق من انتمائها لحلقة المعلّم داخل الاستعلام (غير ذلك 404).
- **الأدوار**: «مشرف» = `role === "supervisor"`؛ «مسمِّع» = أي معلّم (مشرف أو مساعد) فعّال في الحلقة.
- **التفعيل**: إن كان الطابور غير مفعّل للحلقة ⇒ **404** `{ "code": "QUEUE_DISABLED", "error": "طابور التسميع غير مفعّل لحلقتك" }` (عدا `settings`).
- **CSRF** مركزي؛ كل `POST/PATCH/DELETE` محمية. أخطاء بصيغة `{ "error", "code"? }`.
- **Rate limits** (المفتاح — الحد): كتابة `queue-write:${teacher.id}` — 600/ساعة؛ استطلاع `queue-poll:${teacher.id}` — 1500/ساعة.

---

## GET `/api/teacher/queue/session?v=<version>`

لقطة الشاشة. يُنفّذ `closeIfExpired` أولاً.

- **Response 200 — لا جلسة مفتوحة**: `{ "open": false, "lastClosed": { "id": 41, "closedAt": "…", "heard": 12, "notHeard": 2 } | null }`
- **Response 200 — جلسة مفتوحة**:

```json
{
  "open": true,
  "unchanged": false,
  "session": { "id": 42, "version": 17, "openedAt": "…", "closesAt": "…", "date": "2026-10-26" },
  "me": { "id": 5, "name": "الشيخ خالد", "role": "supervisor" },
  "waiting": [ { "entryId": 301, "number": 4, "studentId": "s1", "name": "عمر", "attempt": 1, "planned": "الملك ١–٣٠", "waitingSince": "…" } ],
  "called": [ { "entryId": 298, "number": 2, "studentId": "s2", "name": "علي", "heldBy": { "id": 5, "name": "الشيخ خالد", "mine": true }, "calledAt": "…", "planned": "ص ٥٠٢–٥٠٤", "attempt": 1 } ],
  "reviewing": [ { "entryId": 290, "number": 1, "studentId": "s3", "name": "سعد", "attempt": 2 } ],
  "done": [ { "entryId": 280, "number": 3, "name": "ياسر", "outcome": "mastered" } ],
  "notScanned": [ { "studentId": "s9", "name": "فهد", "attendanceStatus": null } ]
}
```
- `v` يساوي `session.version` الحالي ⇒ `{ "open": true, "unchanged": true }` فقط.
- `waiting` مرتّب بـ`queued_at` تصاعدياً؛ `notScanned` = طلاب فعّالون غير محذوفين بلا دور في الجلسة (مع حالة الحضور المسجّلة اليوم إن وُجدت).
- `called[i].heldBy.mine` يحدد من تظهر له أزرار النتيجة؛ الباقون يرون «عند الشيخ فلان» بلا أزرار نداء.

## POST `/api/teacher/queue/session` — فتح جلسة

- **Auth**: مشرف فقط (403 للمساعد).
- **Request**: `{ "durationMinutes"?: 240 }` (30–720، الافتراضي 240).
- **Response 201**: `{ "ok": true, "sessionId": 42, "closesAt": "…" }`
- **Idempotent**: جلسة مفتوحة قائمة ⇒ **200** `{ "ok": true, "sessionId": 42, "alreadyOpen": true }`.
- **تدقيق**: `security.queue.session_open`.

## DELETE `/api/teacher/queue/session` — إغلاق الجلسة

- **Auth**: مشرف فقط.
- **Response 200**: `{ "ok": true, "heard": 12, "notHeard": 2, "markedAbsent": 3 }`
- **أثر**: الأدوار غير المنتهية ⇒ `not_heard`؛ المحاولات المفتوحة ⇒ `released`؛ الغياب لمن لم يمسح (وبلا ورد اليوم) عبر `INSERT … ON CONFLICT DO NOTHING` بـ`checkin_source='queue'`؛ لا يمسّ حضوراً مسجّلاً.
- لا جلسة مفتوحة ⇒ **404**. **تدقيق**: `security.queue.session_close` (`reason: "manual"`).

---

## POST `/api/teacher/queue/entries/[id]/call` — نادِ

- **Auth**: أي مسمِّع.
- **Request**: بلا جسم.
- **200**: `{ "ok": true, "entryId": 301, "number": 4, "studentName": "عمر", "planned": {…} | null }`
- **409** (حجز لآخر): `{ "code": "ALREADY_HELD", "error": "الطالب عند الشيخ فلان", "heldBy": { "id": 7, "name": "الشيخ فلان" } }`
- **409** (ليس منتظراً): `{ "code": "NOT_WAITING", "status": "reviewing", "error": "هذا الطالب غير منتظر الآن" }`
- **404**: دور غير موجود/من حلقة أخرى/جلسة مغلقة.
- **أثر جانبي**: Push `{ title: "حان دورك", body: "تفضّل عند الشيخ <teacherName>", url: "/student/queue", tag: "queue-call" }` داخل `after()` بسقف ٣ث.

## POST `/api/teacher/queue/entries/[id]/release` — لم يحضر / فك حجز

- **Auth**: الحاجز نفسه (`reason: "no_show"`)، أو المشرف لأي حجز (`reason: "override"`).
- **Request**: `{ "reason": "no_show" | "override" }`
- **200**: `{ "ok": true }` — الدور يعود `waiting` بنفس `queued_at`، والمحاولة تُغلق (`no_show`/`released`).
- **403**: مسمِّع غير حاجز ولا مشرف. **409**: الدور ليس `called`.
- **تدقيق** عند `override`: `security.queue.release_override` (مع `heldBy`).

## POST `/api/teacher/queue/entries/[id]/outcome` — نتيجة التسميع

- **Auth**: الحاجز نفسه أو المشرف.
- **Request**:

```json
{
  "outcome": "mastered",
  "hifz": { "from": { "surah": 67, "ayah": 1 }, "to": { "surah": 67, "ayah": 30 } },
  "hifzPages": null,
  "review": null,
  "note": "ما شاء الله"
}
```
- `outcome`: `"mastered" | "review" | "repeat_more"`.
- `mastered`/`repeat_more`: يجب `hifz` أو `hifzPages` أو `review` (واحد على الأقل؛ `hifz` و`hifzPages` لا يجتمعان)، وإلا **400**. نفس قواعد التحقق في `parseAyahRange`/`parseReviewSegments`.
- `review`: لا يُقبل أي نطاق ولا ورد (يتجاهل الحقول الأخرى).
- **Response 200**:

```json
{ "ok": true, "status": "done", "wardId": 5120, "attempt": 1, "pointsAwarded": 2 }
```
  وللنتيجة `review`: `{ "ok": true, "status": "reviewing", "wardId": null, "attempt": 2 }`.
- **409** `{ "code": "NOT_CALLED" }` إن لم يكن الدور `called` (تكرار الضغط بعد النجاح يرجع نفس النتيجة — **idempotent**: إن كان الدور `done` والمحاولة الأخيرة تحمل `ward_log_id` يُرجَع 200 بنفس `wardId`).
- **المعاملة الواحدة**: (1) `UPDATE entry … WHERE status='called' AND (held_by=$me OR $isSupervisor)` ← (2) إنشاء/ترقية الورد (`createApprovedWardLog` مع `supersedePendingId`) ← (3) إغلاق المحاولة وربط `ward_log_id` ← (4) رفع `session.version`.
- **أثر بعد الحفظ** (لـmastered/repeat_more): `emitHalaqahEvent("progress.recorded")` ثم `progress.approved`؛ `notifyWardDecision` للطالب («سمّعت اليوم: …» أو «يكرر أكثر») وولي الأمر داخل `after()`؛ منح النقاط (001) إن كانت مفعّلة.
- لـ`review`: Push للطالب «راجع ثم اضغط جاهز».

---

## GET `/api/teacher/queue/code`

- **Auth**: أي معلّم (للعرض)؛ ينشئ الرمز كسولاً إن لم يوجد.
- **200**: `{ "code": "<22+ char>", "path": "/student/queue?c=<code>", "enabled": true, "rotatedAt": "…" }`
- يُستعمل في صفحة الطباعة لتوليد QR (`new URL(path, location.origin)`).

## POST `/api/teacher/queue/code` — تجديد الرمز (يُبطل المطبوع)

- **Auth**: مشرف فقط. **Rate limit**: `queue-code:${teacher.id}` — 10/ساعة.
- **200**: `{ "ok": true, "path": "…" }`. **تدقيق**: `security.queue.code_rotate` (بلا قيمة الرمز).

## GET / PATCH `/api/teacher/queue/settings`

- **GET** (أي معلّم): `{ "enabled": true, "override": null | true | false, "stage": "university", "defaultFromStage": true }`
- **PATCH** (مشرف): `{ "override": true | false | null }` ⇒ `{ "ok": true }` (FR-013: تفعيل اختياري لأي فئة).
