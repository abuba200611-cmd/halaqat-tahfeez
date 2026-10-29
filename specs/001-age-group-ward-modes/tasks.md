---

description: "Task list — أنماط تسجيل الورد حسب الفئة العمرية للحلقة"
---

# Tasks: أنماط تسجيل الورد حسب الفئة العمرية للحلقة

**Input**: `specs/001-age-group-ward-modes/` (spec.md, plan.md, data-model.md, contracts/)

**Prerequisites**: الدستور `.specify/memory/constitution.md`؛ كل المسارات أدناه نسبة إلى `web/` ما لم تبدأ بـ`specs/`.

**Tests**: إلزامية للمنطق النقي (الدستور IV): مهمة الاختبار تسبق مهمة التنفيذ وتُشغَّل فتفشل أولاً.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: يمكن تنفيذها بالتوازي (ملفات مختلفة، بلا اعتماد على مهمة غير مكتملة).
- **[Story]**: US1…US6 أو `FND` (أساسيات) أو `GATE` (موافقة المالك) أو `POL` (صقل).
- كل مهمة ≈ ١–٤ ملفات وتُفوَّض لمنفّذ واحد (GLM) بتكليف واحد؛ المراجعة والدمج على Claude.
- **قاعدة حاكمة**: أي مهمة تلمس قاعدة البيانات (`*-db.ts` أو مسار يعتمد على العمود الجديد) **لا تبدأ** قبل اكتمال بوابتها (T001 أو T002). مهام المنطق النقي لا تنتظر أحداً.
- المايقريشنز **تُكتب كملفات فقط بعد الموافقة** ولا يطبّقها أي وكيل؛ التطبيق يقوم به المالك.

---

## Phase 0: بوابات موافقة المالك (GATE)

- [ ] T001 [GATE] **المالك يوافق على المايقريشن M1** `20261115000000_halaqah_stages` (SQL المقترح في `specs/001-age-group-ward-modes/data-model.md` §2) ويطبّقها هو. المخرج: تأكيد كتابي؛ عندها يُنشأ الملف `netlify/database/migrations/20261115000000_halaqah_stages/migration.sql` بمحتوى SQL المعتمد حرفياً. **يحجب**: كل Phase 2 وما بعدها (T013 فصاعداً)؛ ويُستثنى T017 (refactor بلا DB) الذي يمكن البدء به مبكراً. مهام US5 (T039–T052) يحجبها T002 أيضاً.
- [ ] T002 [GATE] **المالك يوافق على المايقريشن M2** `20261116000000_points_rewards` (data-model §3) ويطبّقها. **يحجب**: T042–T052 فقط (US5). الـMVP لا يعتمد عليها.
- [ ] T003 [GATE] المالك يجيب على الأسئلة المفتوحة Q1–Q8 في `specs/ANALYZE.md` (أهمها Q1 إعادة فتح المعتمد، Q2 التعامل مع التكرار، Q4 خصوصية القاصرين، Q3 معنى «وجه»).

---

## Phase 1: منطق نقي (P0) — لا يحتاج مايقريشن، يبدأ فوراً

**Purpose**: كل القرارات القابلة للاختبار قبل لمس قاعدة البيانات.

- [x] T004 [P] [FND] اختبار `lib/halaqah-stage.test.ts`: `STAGES` أربع قيم؛ `profileFor(null)` = ملف `legacy` مطابق للسلوك الحالي (unit `ayah_page`، `teacherRecords:false`، `reviewTracksDefault:true`)؛ `parseStage(unknown)` يرفض غير المعروف ويقبل `null`؛ جدول كل فئة حسب data-model §1.
- [x] T005 [P] [FND] تنفيذ `lib/halaqah-stage.ts` (STAGES, `HalaqahStage`, `WardUnit`, `StageProfile`, `profileFor`, `parseStage`, `STAGE_LABEL_AR`). يعتمد T004.
- [x] T006 [P] [US3] اختبار `lib/quran-surahs.test.ts` (إضافة) و`lib/ward-units.test.ts`: `ayahRangeOfPageRange(from,to)` — round-trip لكل الصفحات ١..٦٠٤ مع `pageRangeOfAyahRange`، وحدود (١، ٦٠٤، صفحة تبدأ في منتصف سورة)؛ `formatWardByUnit` لكل وحدة (مثال: `الفيل ١–٥`، `٣ أوجه (ص ٥٠٢–٥٠٤)`، `جزء ٣٠`)؛ ورد قديم بلا آيات يُعرض بكل وحدة دون فقد.
- [x] T007 [P] [US3] تنفيذ `lib/quran-surahs.ts` (إضافة `ayahRangeOfPageRange`) و`lib/ward-units.ts` (`formatWardByUnit`, `parseHifzPagesInput`, `WARD_UNIT_LABEL_AR`, `wholeSurahRange(surah)`). يعتمد T006.
- [x] T008 [P] [US2] اختبار `lib/ward-policy.test.ts`: `canTeacherRecord(profile)` (primary فقط)؛ `initialStatusFor({recordedVia})` (teacher/queue→approved، student→new)؛ `findSameDayDuplicate(existing[], {date, via})` (يُرجع الأقدم غير `needs_revision`)؛ `canReopen({status, recordedVia})` (true فقط لـapproved + teacher/queue)؛ `clampBackdateDays` (≤ ٣).
- [x] T009 [P] [US2] تنفيذ `lib/ward-policy.ts`. يعتمد T008.
- [ ] T010 [P] [US5] اختبار `lib/points.test.ts`: `parsePointsConfig` (قص/تصحيح/افتراضيات/مفاتيح دخيلة)، `pointsForApproval(config, {stage, mastered, errorScore})`، `balanceOf(entries)`، `validateRedemption({balance, cost, active})` يرجع `missing`، `isPointsEnabled(config, stage, featureEnabled)`.
- [ ] T011 [P] [US5] تنفيذ `lib/points.ts`. يعتمد T010.
- [x] T012 [P] [US6] اختبار `lib/stage-review-tracks.test.ts` ثم تنفيذ `lib/stage-review-tracks.ts`: `reviewTracksVisible(profile, mosqueEnabled)` — جامع معطّل ⇒ false مهما كانت الفئة؛ جامع مفعّل + primary ⇒ false؛ + secondary ⇒ true؛ بلا جامع ⇒ الافتراضيات. (الاختبار أولاً داخل المهمة).

**Checkpoint**: `npx vitest run` أخضر؛ لم يُلمس أي ملف تطبيق.

---

## Phase 2: Foundational (بعد T001) — يحجب كل القصص

- [x] T013 [FND] أنشئ ملف المايقريشن المعتمد `netlify/database/migrations/20261115000000_halaqah_stages/migration.sql` (نسخ حرفي من data-model §2). **لا تُطبَّق من الوكيل.** يعتمد T001.
- [x] T014 [FND] `lib/types.ts` + `lib/db.ts`: أضف `recordedByTeacherId`, `recordedVia` إلى `WardLog`، وعمودي `recorded_by_teacher_id, recorded_via` إلى أعمدة SELECT في `listWardLogs` و`listApprovedWardLogs` وكل استعلامات الأوراد الأخرى الموجودة (ابحث `FROM ward_logs`)؛ `recordedVia ?? "student"` عند القراءة. لا تغيير في حمولة `/api/v1` (اختبار يؤكد).
- [x] T015 [FND] `lib/db.ts`: دالة `createApprovedWardLog(halaqahId, studentId, log, {recordedVia, recordedByTeacherId, supersedePendingId?, repeatMore?}, client?)` (الخياران الأخيران يُعرَّفان في التوقيع الآن ويُفعَّلان بتنفيذ 002/T014 بعد M3) — معاملة واحدة: إدراج `status='approved'` + `reviewed_by/reviewed_at` + المقاطع/الزميل كما في `createWardLog`، وتقبل `client` خارجي (يستعمله الطابور 002). + اختبار `lib/db.test.ts` (إضافة) على نمط المحاكاة القائم. يعتمد T014.
- [x] T016 [FND] `lib/halaqah-stage-db.ts` (`getHalaqahStage`, `setHalaqahStage`, `getStageForStudent`) + إضافة أنواع الأحداث `halaqah.stage_change` (و`points.redeem`, `points.cancel`, `points.reward_edit`) إلى `lib/audit-log-entry.ts` (+ تحديث `lib/audit-log.test.ts`).
- [x] T017 [FND] استخراج `lib/ward-notify.ts` (`notifyWardDecision({halaqahId, studentId, wardId, status, note})` من كتلة `after()` في PATCH بـ`app/api/wards/route.ts` **بسلوك مطابق حرفياً**، و`emitApprovedWardEvents({halaqahId, studentId, wardId, log})` تُصدر `progress.recorded` ثم `progress.approved` — تستعملهما 001/T024 و002/T029)؛ يبقى `app/api/wards/route.test.ts` أخضر دون تعديل توقعاته. (ملف واحد يُعدَّل + ملف جديد).

**Checkpoint**: الأساسيات جاهزة؛ القصص تبدأ.

---

## Phase 3: US1 — تحديد فئة الحلقة (P1) 🎯 MVP

**Goal**: المشرف/مدير الجامع يختار الفئة؛ المساعد يرى فقط.

**Independent Test**: تغيير الفئة من الإعدادات ثم قراءة `GET /api/teacher/settings` والتأكد من `stageProfile`؛ المساعد يتلقى 403 عند PATCH.

- [x] T018 [US1] اختبار `app/api/teacher/settings/route.test.ts` (إضافة): GET يُرجع `stage`/`stageProfile`؛ PATCH `stage` ينجح للمشرف، 403 للمساعد، 400 لقيمة غير معروفة، وسجّل حدث التدقيق. ثم تنفيذ التعديل في `app/api/teacher/settings/route.ts`. (FR-001, FR-002)
- [x] T019 [P] [US1] مسار مدير الجامع `app/api/mosques/[id]/halaqahs/[halaqahId]/stage/route.ts` + `route.test.ts` (404 لحلقة جامع آخر، 401 بلا صلاحية، 429). (FR-002)
- [x] T020 [P] [US1] واجهة المعلّم: `components/halaqah-settings.tsx` + `app/(teacher)/settings/page.tsx` — محدّد فئة (قراءة فقط للمساعد، رسالة «الفئة الافتراضية مطبّقة» عند `null`). رموز الهوية فقط، يعمل على 375px. (US1 سيناريو 1–3)
- [x] T021 [P] [US1] واجهة مدير الجامع: محدّد الفئة في قائمة حلقات الجامع — حدِّد الملف بالبحث في `app/(mosque)/mosque/` عن مكوّن قائمة الحلقات (يُذكر الملف في التسليم)، واستدعِ مسار T019.
- [x] T022 [US1] تمرير `stage` للعملاء: `app/api/wards/mine/route.ts` و`app/api/student/progress/route.ts` (+ اختباراتهما إن وُجدت) يرجعان `stage` و`unit` من `profileFor`. (يحجب US3 واجهة الطالب)

**Checkpoint**: US1 تعمل وحدها؛ الحلقات بلا فئة لا تتغير (SC-005).

---

## Phase 4: US2 — المعلّم يسجّل الورد عن طالب الابتدائي (P1) 🎯 MVP

**Goal**: ورد معتمد باسم المعلّم، تتابع سريع، يظهر للولي.

**Independent Test**: من حساب معلّم حلقة `primary` سجّل ورداً لطالب؛ يظهر معتمداً في سجل الطالب والتقارير، ويُرفض في حلقة غير ابتدائية.

- [x] T023 [US2] اختبار `app/api/teacher/wards/route.test.ts`: 403 `STAGE_NOT_PRIMARY`، نجاح مع `status:'approved'` و`recorded_via:'teacher'`، `wholeSurah`، 404 لطالب خارج الحلقة، 409 `DUPLICATE_TODAY` ثم نجاح مع `confirmDuplicate`، 429، `nextStudentId`، إصدار `progress.recorded` و`progress.approved`. (FR-003, FR-005)
- [x] T024 [US2] تنفيذ `app/api/teacher/wards/route.ts` (POST) باستعمال `parseAyahRange`/`parseReviewSegments`/`ward-policy`/`createApprovedWardLog`/`notifyWardDecision`/`emitHalaqahEvent`؛ ويعتمد T015, T017, T009, T005.
- [x] T025 [P] [US2] `app/api/teacher/wards/roster/route.ts` (GET) + اختبار صغير (يُرجع `recordedToday`، 403 لغير الابتدائي، لا حقول حساسة).
- [x] T026 [US2] `components/teacher-ward-form.tsx`: نموذج بأزرار كبيرة — اختيار السورة (القصيرة أولاً: ترتيب ١١٤→١ مع بحث)، «سورة كاملة»، من آية إلى آية، مراجعة اختيارية، ملاحظة، زر «متقن» عند تفعيل النقاط، تحذير التكرار بزرين. يستعمل `ayah-range-field.tsx` القائم. (FR-004, US2 سيناريو 1)
- [x] T027 [US2] `app/(teacher)/record/page.tsx`: قائمة الطلاب مع شارة «سُجِّل اليوم»، فتح النموذج، وبعد الحفظ الانتقال التلقائي إلى `nextStudentId` دون العودة للرئيسية. إضافة عنصر «تسجيل الورد» في `app/(teacher)/layout.tsx` ظاهر للابتدائي فقط. (US2 سيناريو 2, SC-001)
- [x] T028 [P] [US2] `app/(teacher)/students/[id]/page.tsx`: زر «تسجيل ورد» يظهر لحلقة `primary` فقط (سيناريو 4)، يفتح `record?student=`.
- [x] T029 [US2] حارس التكرار من جهة الطالب: `app/api/wards/route.ts` (POST) يرجع 409 `DUPLICATE_TODAY` عند وجود ورد معلّم لنفس اليوم + عرض الرسالة في `app/(student)/student/log/page.tsx`. اختبار في `app/api/wards/route.test.ts` (إضافة). (FR-005)
- [x] T030 [P] [US2] متابعة ولي الأمر: `app/api/parent/child/route.ts` يضيف `recordedVia` و`note`؛ وعرض «سجّله المعلّم» في صفحة ولي الأمر (حدِّد الملف في `app/(parent)/parent/`). (US2 سيناريو 3)

**Checkpoint**: US1+US2 = **MVP قابل للنشر** (بعد البوابات).

---

## Phase 5: US3 — وحدة قياس الورد حسب الفئة (P2)

**Goal**: الإدخال والعرض بوحدة الفئة؛ التخزين لا يتغير.

**Independent Test**: نفس الورد في حلقتين مختلفتين: إدخال وعرض مختلفان وصفوف قاعدة بيانات متطابقة.

- [x] T031 [US3] اختبار `lib/student-ward-display.test.ts` (إضافة): `hifzRangeText`/`reviewRangeText` تقبل `unit` اختيارياً (الافتراضي = السلوك الحالي)، والورد القديم يُعرض بكل الوحدات. ثم تعديل `lib/student-ward-display.ts` ليستعمل `formatWardByUnit`. (FR-006, FR-007)
- [x] T032 [US3] `components/ward-input-by-unit.tsx`: يعرض حقول الإدخال حسب `unit` — `surah_ayah`/`ayah_page` = `ayah-range-field` القائم (+ عرض الصفحات المقابلة للمتوسط)، `page_wajh`/`wajh_juz` = حقلا صفحة (من/إلى) وأزرار اختيار جزء. يُخرج دائماً `{hifz}` أو `{hifzPages}`.
- [x] T033 [US3] `app/api/wards/route.ts` (POST/PUT): قبول `hifzPages` عبر `parseHifzPagesInput` + `ayahRangeOfPageRange` ثم `parseAyahRange`؛ 400 إن اجتمعا. اختبار في `route.test.ts` (إضافة). (يتسلسل بعد T029 — نفس الملف)
- [x] T034 [US3] `app/(student)/student/log/page.tsx` يستعمل `ward-input-by-unit` حسب `stage` من T022؛ ويعرض النتيجة بالوحدة. (SC-002: أقل من ٣٠ ثانية للجامعي)
- [x] T035 [P] [US3] عرض القوائم بالوحدة: `components/ward-list.tsx` و`app/(student)/student/wards/page.tsx` و`app/(teacher)/inbox/page.tsx` (يمرّر `unit` من الفئة).

---

## Phase 6: US4 — الاعتماد حسب الفئة (P2)

**Goal**: ابتدائي معتمد تلقائياً بيد المعلّم؛ متوسط/ثانوي يدوي؛ إعادة فتح المعتمد من المعلّم/الطابور.

**Independent Test**: حلقة متوسط: ورد الطالب `new`؛ حلقة ابتدائي: ورد المعلّم `approved`؛ ثم «طلب إعادة» على ورد المعلّم المعتمد يصل للطالب/الولي.

- [x] T036 [US4] اختبار ثم تنفيذ `reopenApprovedWard(halaqahId, wardId, teacherId, note)` في `lib/db.ts` (+ `lib/db.test.ts`): ينجح فقط لـ`approved` و`recorded_via ∈ {teacher,queue}`، ملاحظة إلزامية، يرجع null لورد `student` المعتمد. (FR-009) — **يتوقف على جواب Q1**.
- [x] T037 [US4] `app/api/wards/route.ts` (PATCH): فرع `needs_revision` على المعتمد يستدعي `reopenApprovedWard` (وفق T036) + اختبار؛ و`app/(teacher)/inbox/page.tsx`: زر «طلب إعادة» لورد معتمد من المعلّم وشارة «سجّله المعلّم/الطابور». (يتسلسل بعد T033 — نفس الملف)
- [x] T038 [P] [US4] اختبار تكاملي في `app/api/wards/route.test.ts`/`app/api/teacher/wards/route.test.ts`: مصفوفة الفئة × المسجِّل ⇒ الحالة الابتدائية (primary/teacher→approved؛ intermediate/student→new؛ secondary/student→new؛ university/student→new). (FR-008)

---

## Phase 7: US5 — النقاط والتحفيز (P3) — يحجبه T002

**Goal**: دفتر نقاط، جوائز، استبدال بخصم وتسليم.

**Independent Test**: اعتماد ورد لطالب ابتدائي ⇒ +نقطة؛ طلب جائزة ⇒ خصم؛ إلغاء ⇒ استرجاع؛ الرصيد = مجموع الحركات دائماً.

- [ ] T039 [US5] أنشئ ملف المايقريشن المعتمد `netlify/database/migrations/20261116000000_points_rewards/migration.sql` (نسخ حرفي من data-model §3). لا تُطبَّق من الوكيل. يعتمد T002.
- [ ] T040 [P] [US5] `lib/points-config.ts` (+ `.test.ts`): قراءة/كتابة config ميزة `stage_points` من `mosque_features` عبر نمط `lib/mosque/review-tracks-db.ts`؛ إضافة الميزة إلى `lib/mosque/features.ts`.
- [ ] T041 [US5] اختبار `lib/points-db.test.ts` (محاكاة `db()` بنمط `lib/fees-db.test.ts`): `awardPointsForApproval` idempotent (استدعاءان = حركة واحدة)، `redeem` يخصم ويرفض الناقص بـ`missing`، `cancel` يُنشئ `refund` مرة واحدة، `deliver` لا يغيّر الدفتر، حالة نهائية ⇒ خطأ، واختبار «لا UPDATE/DELETE على points_ledger» يمسح `lib/**/*.ts` نصياً.
- [ ] T042 [US5] تنفيذ `lib/points-db.ts` (`getBalance`, `listLedger`, `awardPointsForApproval`, `listRewardsFor`, `createReward`, `updateReward`, `redeemReward` بمعاملة + `pg_advisory_xact_lock`, `resolveRedemption`). يعتمد T011, T040, T041.
- [ ] T043 [US5] ربط المنح: أضف `afterWardApproved({halaqahId, studentId, wardId, log, status, note, mastered})` إلى `lib/ward-notify.ts` (تجمع `emitApprovedWardEvents` + `notifyWardDecision` + `awardPointsForApproval`) واستدعِها من `app/api/wards/route.ts` (PATCH فرع approved) و`app/api/teacher/wards/route.ts` (POST) — أخطاء المنح تُسجَّل ولا تُفشل الاعتماد. اختبارات في الملفين. (يتسلسل بعد T037)
- [ ] T044 [P] [US5] مسارات المعلّم: `app/api/teacher/rewards/route.ts` و`app/api/teacher/rewards/[id]/route.ts` (+ اختبار صلاحيات: مشرف يكتب، مساعد 403، جائزة جامع قراءة فقط).
- [ ] T045 [P] [US5] مسارات الطلبات: `app/api/teacher/redemptions/route.ts` و`app/api/teacher/redemptions/[id]/route.ts` (+ اختبار 409 للحالة النهائية و404 لحلقة أخرى).
- [ ] T046 [P] [US5] مسارات الطالب/الولي: `app/api/student/points/route.ts`, `app/api/rewards/redeem/route.ts`, `app/api/parent/points/route.ts`, `app/api/parent/redeem/route.ts` (+ اختبار `INSUFFICIENT_POINTS` و403 للنقاط المعطّلة و404 لطالب غير مرتبط بالولي).
- [ ] T047 [P] [US5] مسارات الجامع: `app/api/mosques/[id]/points/route.ts` و`app/api/mosques/[id]/rewards/route.ts` (featureGate).
- [ ] T048 [P] [US5] `components/points-card.tsx` (رصيد، نجوم SVG بلون الأكسنت، قائمة الجوائز مع «ينقصك N»، زر طلب بثلاث نقرات كحد أقصى SC-004) + `app/(student)/student/rewards/page.tsx` + إدراجها في لوحة الطالب. يخفي نفسه عند `enabled:false`.
- [ ] T049 [P] [US5] عرض النقاط لولي الأمر داخل صفحة الابن (حدِّد الملف في `app/(parent)/parent/`) مع زر طلب جائزة.
- [ ] T050 [US5] `app/(teacher)/rewards/page.tsx`: إدارة الجوائز (إضافة/تعديل/إيقاف) + قائمة الطلبات (تسليم/إلغاء) + طلب عن الطالب الصغير؛ عنصر قائمة في `app/(teacher)/layout.tsx` (يتسلسل بعد T027 — نفس الملف).
- [ ] T051 [P] [US5] واجهة قيم النقاط للجامع في صفحة إعدادات الجامع `app/(mosque)/mosque/settings/` (حدِّد الملف) + إدارة جوائز الجامع.
- [ ] T052 [US5] إخفاء النقاط عن غير المفعّل لها (جامعي): اختبار في `app/api/student/points/route.test.ts` + تأكد أن `points-card` لا يُرندَر (SC سيناريو 2).

---

## Phase 8: US6 — الكبرى والصغرى حسب الفئة (P3)

**Goal**: التصنيف يظهر فقط إذا فعّله الجامع والفئة تستخدمه.

**Independent Test**: جامع مفعّل التصنيف: حلقة ابتدائي لا تُظهره، حلقة ثانوي تُظهره؛ جامع معطّل: لا يظهر لأي فئة.

- [ ] T053 [US6] `lib/mosque/review-tracks-db.ts` (`reviewTrackConfigForHalaqah` يمرّر `enabled` عبر `reviewTracksVisible` من T012) + اختبار/تحديث الاختبار القائم؛ `app/api/wards/route.ts` GET يعكس النتيجة (يتسلسل بعد T043). (FR-011)
- [ ] T054 [P] [US6] الواجهات تحترم `reviewTrackConfig.enabled` كما هي (تحقق فقط): `components/review-segments-field.tsx`, `components/review-track-bits.tsx`، ولقطة تأكيد أن الابتدائي لا يظهر فيه التصنيف في النموذج `teacher-ward-form`.

---

## Phase 9: Polish وعبر القصص

- [ ] T055 [POL] **تدقيق خصوصية القاصرين (FR-013)**: افحص ما يعرض أسماء/بيانات طلاب لغير المعلّم/الولي/الإدارة: `lib/db.ts listClassmateNames` وسياسة `classmates_visible`، `lib/mosque/honor-board*.ts`، `app/api/student/classmates`، `lib/api-v1*.ts`؛ طبّق القاعدة المعتمدة في Q4 (افتراضياً: لا زملاء ولا لوحة شرف بأسماء طلاب `primary`). اختبارات لكل نقطة تُعدَّل.
- [ ] T056 [P] [POL] اختبار انحدار SC-003: ورد قديم (آيات + صفحات فقط + مراجعة بمقاطع) يُقرأ ويُعرض في كل فئة بلا تغيير، وحمولة `GET /api/v1/*` وأحداث `progress.*` مطابقة لما قبل (snapshot).
- [ ] T057 [P] [POL] لقطات بصرية 1440 و375، داكن وفاتح، لشاشات: إعدادات الفئة، تسجيل المعلّم، رصيد الطالب، إدارة الجوائز (استعمل `~/.claude/tools/shot.mjs`)؛ تحقق عدم وجود تمرير أفقي وألوان الهوية فقط.
- [ ] T058 [POL] البوابات من `web/`: `npx tsc --noEmit`، `npx eslint .` (0 أخطاء)، `npx vitest run`، `npm run build` — كلها خضراء قبل أي دمج.
- [ ] T059 [POL] تحديث `README.md` (الفئات والنقاط) وسجل الدروس/الذاكرة؛ رسالة الكومت بالعربي؛ تحقق من نشر Vercel بعد الدمج.

---

## Dependencies & Execution Order

- **P0 (T004–T012)**: بلا اعتماد على أي بوابة؛ تُوزَّع بالتوازي فوراً.
- **T001** → T013 → T014 → T015؛ T016 و T017 بعد T013 (T017 لا يحتاج DB فعلياً ويمكن البدء به مبكراً كـrefactor).
- **US1 (T018–T022)** بعد T016 (+T005). **US2 (T023–T030)** بعد T015, T017, T009, T025 بعد T014.
- **US3** منطقه (T006/T007) جاهز مبكراً؛ واجهته (T032–T035) بعد T022.
- **US4**: T036 يتوقف على Q1؛ T037 بعد T033؛ T038 بعد T024.
- **US5** كله بعد T002 (T039 أولاً) ثم T040/T041 بالتوازي ← T042 ← الباقي. T043 بعد T037.
- **US6** بعد T012 و T043.
- **Polish** بعد القصص المطلوبة للإصدار.

### ملفات مشتركة تُفرض عليها المهام تسلسلاً (لا [P])

- `app/api/wards/route.ts`: T017 → T029 → T033 → T037 → T043 → T053.
- `app/(teacher)/layout.tsx`: T027 → T050.
- `lib/db.ts`: T014 → T015 → T036.
- `app/api/wards/route.test.ts`: يتبع نفس تسلسل المسار.

### Parallel Example (بعد T001)

```text
Task: T016 lib/halaqah-stage-db.ts + audit events
Task: T017 lib/ward-notify.ts (refactor)
Task: T019 app/api/mosques/[id]/halaqahs/[halaqahId]/stage/route.ts
Task: T025 app/api/teacher/wards/roster/route.ts
```

## Implementation Strategy

### MVP (الإصدار الأول)

1. T004–T012 (منطق نقي) ← T001 (موافقة M1) ← T013–T017.
2. US1 (T018–T022) ← US2 (T023–T030).
3. **STOP & VALIDATE**: معلّم ابتدائي يسجّل ١٠ طلاب < ٥ دقائق من الجوال؛ الحلقات بلا فئة بلا تغيير. البوابات (T058) ثم دمج ونشر.

### التسليم التدريجي

4. US3 + US4 (وحدات القياس + الاعتماد) — يمكن تشغيل 002 بعد T015 مباشرة لأنه يعتمد `createApprovedWardLog`.
5. US5 بعد موافقة M2.
6. US6 + T055 (الخصوصية) + الصقل.

## Notes

- كل مهمة تنتهي بـ: الاختبارات الخاصة بها خضراء + `tsc` على ملفاتها؛ المراجعة على Claude.
- لا تبعيات npm جديدة. لا قراءة `.env`. لا تطبيق مايقريشن من وكيل.
- الرسائل والواجهات بالعربية، ورموز الهوية فقط (لا ألوان Tailwind صريحة، لا تيل).
