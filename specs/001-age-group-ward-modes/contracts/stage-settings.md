# Contract: فئة الحلقة (Stage Settings)

كل مسارات الكتابة: CSRF مركزي (`proxy.ts`) + `checkRateLimit` + تحقق الجلسة. أخطاء JSON بصيغة `{ "error": "<عربي>", "code"?: "<ثابت>" }`.

## GET `/api/teacher/settings` (موجود — يُوسَّع)

- **Auth**: `currentTeacher()` (أي دور).
- **Response 200** (الحقلان الأخيران جديدان):

```json
{
  "buddyResetOnEdit": false,
  "role": "supervisor",
  "stage": "primary",
  "stageProfile": { "stage": "primary", "unit": "surah_ayah", "teacherRecords": true, "pointsEnabled": true, "reviewTracksVisible": false }
}
```
- `stage`: `"primary" | "intermediate" | "secondary" | "university" | null`. `null` ⇒ النمط الافتراضي الحالي.
- `pointsEnabled` و`reviewTracksVisible` محسوبان في الخادم (ملف الفئة + إعدادات الجامع).

## PATCH `/api/teacher/settings` (موجود — يُوسَّع)

- **Auth**: `currentTeacher()` و`role === "supervisor"` وإلا 403 (كما هو اليوم للإعدادات الأخرى).
- **Request**: أحد الحقلين أو كلاهما — `{ "buddyResetOnEdit"?: boolean, "stage"?: "primary"|"intermediate"|"secondary"|"university"|null }`
- **Response 200**: `{ "ok": true }`
- **Errors**: 400 `قيمة غير صحيحة` (فئة غير معروفة)؛ 403 للمساعد؛ 429.
- **أثر جانبي**: `logSecurityEvent({ event: "halaqah.stage_change", actorKind: "teacher", actorId, details: { halaqahId, from, to } })`.

## PATCH `/api/mosques/[id]/halaqahs/[halaqahId]/stage` (جديد)

- **Auth**: `canAccessMosque(mosqueId)` (مدير الجامع)؛ الحلقة يجب أن تتبع هذا الجامع (`halaqahs.mosque_id = [id]`) وإلا 404.
- **Rate limit**: `halaqah-stage:${mosqueId}` — 60 / ساعة.
- **Request**: `{ "stage": "primary" | "intermediate" | "secondary" | "university" | null }`
- **Response 200**: `{ "ok": true, "stage": "primary" }`
- **Errors**: 400 فئة غير صالحة؛ 401؛ 404 حلقة ليست للجامع؛ 429.
- **أثر جانبي**: `security.halaqah.stage_change` بـ`actorKind: "mosque_admin"`.

## GET / PATCH `/api/mosques/[id]/points` (جديد — ميزة `stage_points`)

- **Auth**: `featureGate(mosqueId, "stage_points")` (401 بلا صلاحية، 404 للميزة المعطّلة).
- **GET 200**: `{ "enabled": true, "config": { "stages": ["primary"], "perApproved": 1, "masteryBonus": 1, "masteryMinScore": 90 } }`
- **PATCH Request**: نفس شكل `config`؛ القيم تُصحَّح (`perApproved` 0–20، `masteryBonus` 0–20، `masteryMinScore` 0–100، `stages` ⊂ STAGES).
- **PATCH 200**: `{ "ok": true, "config": { ... } }`؛ **400** على نوع خاطئ.
