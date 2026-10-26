# Contract: النقاط والجوائز والاستبدال

كل الكتابة داخل معاملة قاعدة بيانات؛ الدفتر append-only؛ الرصيد = `SUM(points)`.

## GET `/api/student/points`
- **Auth**: `currentStudent()`. **Response 200**:

```json
{
  "enabled": true,
  "balance": 12,
  "ledger": [ { "id": 5, "kind": "award", "points": 1, "createdAt": "2026-10-26T08:00:00Z", "wardLogId": 77 } ],
  "rewards": [ { "id": 3, "name": "ملصق", "costPoints": 10, "affordable": true, "missing": 0 } ],
  "redemptions": [ { "id": 2, "rewardName": "ملصق", "costPoints": 10, "status": "requested", "createdAt": "2026-10-26T08:05:00Z" } ]
}
```
- `enabled:false` ⇒ بقية الحقول غائبة (الواجهة تخفي القسم، FR-010).

## GET `/api/parent/points?studentId=…`
- **Auth**: `currentParent()` والطالب مرتبط (`parent_children`) وإلا 404. نفس الشكل أعلاه (قراءة).

## POST `/api/rewards/redeem` (الطالب)
- **Auth**: `currentStudent()`؛ **Rate limit** `redeem:${halaqahId}:${studentId}` — 20 / ساعة.
- **Request**: `{ "rewardId": 3 }`
- **200**: `{ "ok": true, "redemptionId": 2, "balance": 2 }`
- **Errors**:
  - 404 جائزة غير موجودة/غير مفعّلة/ليست لحلقته أو جامعه.
  - **422** `{ "code": "INSUFFICIENT_POINTS", "error": "ينقصك ٣ نقاط", "missing": 3 }`.
  - 403 النقاط غير مفعّلة لحلقته. 429.
- **التزامن**: داخل معاملة مع `pg_advisory_xact_lock(hashtext(halaqah||':'||student))`؛ يُعاد حساب الرصيد داخلها.

## POST `/api/parent/redeem`
- **Auth**: `currentParent()`؛ **Request**: `{ "studentId": "…", "rewardId": 3 }`؛ نفس الاستجابات؛ `requested_by='parent'`.

## الجوائز (المعلّم) — `/api/teacher/rewards`
- `GET` ⇒ `{ "rewards": [ { "id", "name", "costPoints", "active", "scope": "halaqah" | "mosque" } ] }` (جوائز الحلقة + جوائز جامعها).
- `POST { name, costPoints, active? }` ⇒ 201 `{ "id" }` — **مشرف فقط** (قرار افتراضي، سؤال Q5).
- `PATCH /api/teacher/rewards/[id] { name?, costPoints?, active? }` ⇒ 200. جوائز الجامع (`scope:"mosque"`) للقراءة فقط للمعلّم ⇒ 403.
- لا `DELETE`: الإيقاف عبر `active:false` (تبقى لقطات الطلبات سليمة).
- **Rate limit**: `rewards-edit:${teacher.id}` — 120 / ساعة؛ **تدقيق**: `security.points.reward_edit`.

## جوائز الجامع — `/api/mosques/[id]/rewards` (مدير الجامع)
نفس الأشكال أعلاه مع `featureGate(mosqueId, "stage_points")`.

## الطلبات (المعلّم) — `/api/teacher/redemptions`
- `GET ?status=requested` ⇒ `{ "redemptions": [ { "id", "studentName", "rewardName", "costPoints", "status", "requestedBy", "createdAt" } ] }`.
- `POST { studentId, rewardId }` ⇒ المعلّم يطلب عن الطالب (للصغار بلا حساب)؛ نفس شرط الرصيد؛ `requested_by='teacher'`.
- `PATCH /api/teacher/redemptions/[id] { "action": "deliver" | "cancel" }`:
  - `deliver`: `requested → delivered` (لا أثر على الدفتر).
  - `cancel`: `requested → cancelled` + حركة `refund` بالقيمة نفسها (مرة واحدة).
  - حالة نهائية ⇒ **409** `{ "error": "الطلب لم يعد قابلاً للتغيير" }`. حلقة الطلب يجب أن تطابق حلقة المعلّم وإلا 404.
- **تدقيق**: `security.points.redeem` / `security.points.cancel`.
