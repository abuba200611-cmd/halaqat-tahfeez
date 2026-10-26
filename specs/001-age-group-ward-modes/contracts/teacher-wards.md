# Contract: تسجيل المعلّم للورد (الابتدائي)

## POST `/api/teacher/wards`

- **Auth**: `currentTeacher()` (مشرف أو مساعد). الحلقة من الجلسة فقط، لا من الجسم.
- **شرط الفئة**: فئة حلقة المعلّم `primary` وإلا **403** `{ "code": "STAGE_NOT_PRIMARY", "error": "تسجيل الورد عن الطالب متاح لحلقات الابتدائي فقط" }`.
- **Rate limit**: `teacher-ward:${teacher.id}` — 300 / ساعة.
- **Request**:

```json
{
  "studentId": "s_abc",
  "date": "2026-10-26",
  "hifz": { "from": { "surah": 105, "ayah": 1 }, "to": { "surah": 105, "ayah": 5 } },
  "wholeSurah": null,
  "review": [ { "from": { "surah": 1, "ayah": 1 }, "to": { "surah": 1, "ayah": 7 } } ],
  "note": "ما شاء الله",
  "mastered": true,
  "confirmDuplicate": false
}
```
- `date` اختياري: الافتراضي اليوم بتوقيت الرياض، وأقصى رجوع ٣ أيام.
- `wholeSurah`: رقم سورة بديل لـ`hifz` (يُحوَّل إلى الآية ١ → آخر آية). `hifz` و`wholeSurah` لا يجتمعان (400).
- `review`: اختياري، ١–١٠ مقاطع (نفس `parseReviewSegments`).
- يجب وجود `hifz` أو `wholeSurah` أو `review` أو `note` (كما في POST الطالب). `note` ≤ 500.
- `mastered`: اختياري، يمنح بونس الإتقان إن كانت النقاط مفعّلة.
- `confirmDuplicate`: `true` بعد تحذير التكرار.
- **Response 200**:

```json
{ "ok": true, "id": 1234, "status": "approved", "pointsAwarded": 2, "nextStudentId": "s_def" }
```
  `nextStudentId` = الطالب التالي في ترتيب القائمة ممن لم يُسجَّل له ورد اليوم (أو `null`) لدعم التتابع (FR-004).
- **Errors**:
  - 400 رسائل التحقق نفسها لـ`parseAyahRange`/`parseReviewSegments`.
  - 404 `{ "error": "الطالب غير موجود في حلقتك" }` (طالب محذوف/غير فعّال/من حلقة أخرى — الشرط داخل الاستعلام).
  - 403 `STAGE_NOT_PRIMARY`.
  - **409** `{ "code": "DUPLICATE_TODAY", "existing": { "id": 99, "recordedVia": "student", "status": "new", "summary": "الفيل ١–٥" } }` إن وُجد ورد لنفس الطالب والتاريخ ولم يُرسل `confirmDuplicate: true`.
  - 429.
- **أثر جانبي** (بعد الحفظ، مثل PATCH الطالب): `emitHalaqahEvent("progress.recorded")` ثم `progress.approved`؛ `notifyWardDecision` (push للطالب إن اشترك + ولي الأمر + واتساب) داخل `after()` بسقف ٣ث؛ منح النقاط إن كانت مفعّلة.
- **ضمانات**: الورد يُحفظ `status='approved'`, `recorded_via='teacher'`, `recorded_by_teacher_id`, `reviewed_by`, `reviewed_at` في معاملة واحدة.

## GET `/api/teacher/wards/roster`

- **Auth**: `currentTeacher()`.
- **Response 200**:

```json
{
  "stage": "primary",
  "date": "2026-10-26",
  "students": [ { "id": "s_abc", "name": "أحمد", "recordedToday": true, "lastSummary": "الفيل ١–٥" } ]
}
```
- 403 `STAGE_NOT_PRIMARY` لحلقة غير ابتدائية. الاستعلام: `students` (فعّال وغير محذوف) + وجود `ward_logs` بتاريخ اليوم. لا يُرجَع أي حقل حساس (هاتف، ولي أمر).
