---

description: "Task list — طابور التسميع بالباركود (الحلقات الجامعية)"
---

# Tasks: طابور التسميع بالباركود

**Input**: `specs/002-recitation-queue/` (spec.md, plan.md, data-model.md, contracts/)

**Prerequisites**: مواصفة 001 — على الأقل: ملف الفئة (001/T005)، `createApprovedWardLog` (001/T015)، `notifyWardDecision` (001/T017)، `ward-input-by-unit` (001/T032)، والمايقريشن M1 مطبّقة. الدستور `.specify/memory/constitution.md`.

**Tests**: إلزامية للمنطق النقي وطبقة DB (محاكاة) ومسارات API؛ مهمة الاختبار تسبق التنفيذ وتفشل أولاً.

## Format: `[ID] [P?] [Story] Description`

- **[P]** يمكن تنفيذها بالتوازي؛ **[Story]**: US1–US4 أو `GATE`/`FND`/`POL`.
- المسارات نسبة إلى `web/` ما لم تبدأ بـ`specs/`. كل مهمة ≈ ١–٤ ملفات وتُفوَّض بتكليف واحد.
- المهام التي تلمس قاعدة البيانات لا تبدأ قبل T001 (M3) وقبل اكتمال متطلبات 001.
- الإشارات `001/Txxx` تعني مهام `specs/001-age-group-ward-modes/tasks.md`.

---

## Phase 0: بوابات (GATE)

- [ ] T001 [GATE] **المالك يوافق على المايقريشن M3** `20261117000000_recitation_queue` (SQL المقترح في `specs/002-recitation-queue/data-model.md` §1) ويطبّقها هو. **يحجب**: T011 وكل مهام DB والمسارات والواجهات بعدها.
- [ ] T002 [GATE] تأكيد اكتمال متطلبات 001: M1 مطبّقة + 001/T005, T015, T017 مدموجة (يتحقق Claude من الفرع قبل تفويض أي مهمة DB هنا).
- [ ] T003 [GATE] المالك يجيب على أسئلة الطابور في `specs/ANALYZE.md` (Q-Q1 موضع العائد من المراجعة، Q-Q2 حدّ عدد النداءات المتزامنة للمسمِّع، Q-Q3 عودة من أتقن، Q-Q4 انتهاء الحجز).

---

## Phase 1: منطق نقي (Q0) — يبدأ فوراً بلا مايقريشن

- [ ] T004 [P] [FND] اختبار `lib/recitation-queue.test.ts`: `nextStatus(status, action)` لكل انتقال في جدول data-model §3 (مسموح/ممنوع)؛ `orderWaiting(entries)` بـ`queuedAt` ثم `number`؛ `aheadOf(entry, entries)`؛ `isSessionExpired(closesAt, now)`؛ `sessionDeadline(openedAt, minutes)` (قص 30–720، الافتراضي 240)؛ `canResolve({heldBy, role, teacherId})` (الحاجز أو المشرف)؛ `notScanned(roster, entries)`؛ `summarizePlanned(planned)` نص عربي.
- [ ] T005 [P] [FND] تنفيذ `lib/recitation-queue.ts` (أنواع `QueueStatus`, `QueueAction`, `QueueEntryView`, الدوال أعلاه). يعتمد T004.
- [ ] T006 [P] [FND] اختبار `lib/queue-code.test.ts`: `generateQueueCode()` ≥ ٢٢ حرفاً base64url وفريد عبر ١٠٠٠ استدعاء؛ `isValidQueueCodeFormat` يرفض الطويل/الرموز/الفارغ؛ `queuePath(code)` = `/student/queue?c=…`.
- [ ] T007 [P] [FND] تنفيذ `lib/queue-code.ts`. يعتمد T006.
- [ ] T008 [P] [FND] اختبار `lib/queue-outcome.test.ts`: `buildOutcomePlan` للنتائج الثلاث (mastered→ورد معتمد، repeat_more→ورد + `repeatMore:true`، review→بلا ورد)؛ رفض النتائج غير المعروفة؛ `buildQueueWardNote(note, attempt)` يلحق «(المحاولة ٢)» عند N>1 فقط؛ `masteryEligible(outcome, attempt)` = mastered && attempt==1؛ رفض mastered/repeat_more بلا نطاق.
- [ ] T009 [P] [FND] تنفيذ `lib/queue-outcome.ts`. يعتمد T008.
- [ ] T010 [P] [FND] استخراج `components/qr-svg.tsx` (`QrSvg` من `components/qr-checkin-panel.tsx` حرفياً: وحدات سوداء على أبيض، هامش هادئ ٤) وجعل `qr-checkin-panel.tsx` يستورده — بلا أي تغيير سلوكي؛ يبقى `app/api/attendance/qr/route.test.ts` أخضر.

**Checkpoint**: `npx vitest run` أخضر.

---

## Phase 2: Foundational (بعد T001 + T002)

- [ ] T011 [FND] أنشئ ملف المايقريشن المعتمد `netlify/database/migrations/20261117000000_recitation_queue/migration.sql` (نسخ حرفي من data-model §1). **لا تُطبَّق من الوكيل.**
- [ ] T012 [P] [FND] `lib/audit-log-entry.ts` (+ `lib/audit-log.test.ts`): أنواع `queue.session_open`, `queue.session_close`, `queue.code_rotate`, `queue.release_override`. (يتسلسل مع 001/T016 — نفس الملف؛ يُدمج بعده.)
- [ ] T013 [FND] `lib/attendance-db.ts`: معامل `source` اختياري (الافتراضي `"qr"`) في `recordQrCheckin`، ودالة جديدة `fillAbsentForSession(halaqahId, date, recordedBy)` — يُدرج `absent` (`checkin_source='queue'`) لطلاب الحلقة الفعّالين بلا صف حضور وبلا أي ورد في ذلك التاريخ، `ON CONFLICT DO NOTHING`، ويرجع العدد. + اختبار جديد `lib/attendance-db.test.ts` بمحاكاة `db()` (يتأكد من نص `ON CONFLICT`، وعدم الكتابة لمن لديه ورد).
- [ ] T014 [FND] `lib/types.ts` + `lib/db.ts`: حقل `repeatMore: boolean` في `WardLog` وإضافة `w.repeat_more` إلى استعلامات أوراد الطالب/الولي/المعلّم؛ وخيار `supersedePendingId` في `createApprovedWardLog` (001/T015): يحدّث ورد الطالب المعلّق ليومه (`status IN ('new','seen')` و`recorded_via IS NULL OR 'student'`) بمحتوى المسمِّع (إعادة كتابة المقاطع) ويعتمده بدل إدراج جديد، داخل المعاملة نفسها، ويقبل `repeatMore`. + اختبارات في `lib/db.test.ts`.
- [ ] T015 [FND] `lib/recitation-queue-db.ts` (+ `.test.ts` بمحاكاة): `ensureQueueCode(halaqahId)`, `rotateQueueCode`, `findHalaqahByQueueCode(code)`, `queueEnabledForHalaqah(halaqahId)` (`override ?? profileFor(stage).queueDefault`), `setQueueOverride`, `openSession(halaqahId, openedBy, minutes)` (يعالج تعارض الفهرس الفريد بإرجاع القائمة)، `closeIfExpired(halaqahId)`, `closeSession(halaqahId, closedBy, reason)` — يغلق الأدوار والمحاولات المفتوحة ويستدعي `fillAbsentForSession` ويرفع `version`. يعتمد T005, T007, T011, T013.
- [ ] T016 [FND] `lib/recitation-queue-snapshot-db.ts` (+ اختبار): `teacherSnapshot(halaqahId, teacherId, knownVersion?)` و`studentView(halaqahId, studentId, knownVersion?)` بالشكل المحدد في contracts؛ استعلام واحد مفهرس للأدوار + قائمة `notScanned` + حالة الحضور؛ `unchanged` عند تطابق `version`. يعتمد T015.

**Checkpoint**: طبقة الجلسات والرمز واللقطات جاهزة.

---

## Phase 3: US1 — فتح الجلسة والمسح وأخذ الرقم (P1) 🎯 MVP

**Goal**: المشرف يفتح الجلسة؛ الطالب يمسح فيأخذ رقماً ويُسجَّل حضوره.

**Independent Test**: فتح جلسة، مسح الرمز بحساب طالب، ظهور رقمه وحضوره؛ مسح ثانٍ يرجع الرقم نفسه؛ بلا جلسة رسالة واضحة.

- [ ] T017 [US1] اختبار `lib/recitation-queue-entries-db.test.ts` (جزء المسح): رقم متسلسل بلا فجوات، مسح متكرر = نفس الرقم، رفض طالب غير فعّال/من حلقة أخرى، جلسة منتهية، `ready` من `reviewing` فقط. ثم تنفيذ `scanIntoSession`, `markReady`, `updatePlanned` في `lib/recitation-queue-entries-db.ts` باستعلام CTE في data-model §2 وباستدعاء `recordQrCheckin(…, "queue")`. يعتمد T015.
- [ ] T018 [US1] اختبار مسارات الطالب ثم تنفيذها: `app/api/student/queue/scan/route.ts`, `app/api/student/queue/ready/route.ts`, `app/api/student/queue/planned/route.ts` (+ `route.test.ts` لكل منها أو ملف واحد): 403 `WRONG_HALAQAH`، 409 `NO_OPEN_SESSION`، 404 `QUEUE_DISABLED`، 400 رمز مشوّه، 429. يعتمد T017.
- [ ] T019 [US1] `app/api/student/queue/route.ts` (GET حالتي مع `?v=`) + اختبار. يعتمد T016.
- [ ] T020 [P] [US1] واجهة الطالب: `components/student-queue-card.tsx` + `app/(student)/student/queue/page.tsx` (قراءة `?c` ثم `replaceState`، استطلاع ٤ث بـ`v`، رقم كبير، «قبلك N»، حقل «ما سأسمّعه» اختياري عبر `ward-input-by-unit` من 001/T032، زر «جاهز»، الحالات والأخطاء) + عنصر ملاحة «الطابور» عند التفعيل (حدِّد ملف ملاحة الطالب). (FR-011, SC-001)
- [ ] T021 [US1] `app/api/teacher/queue/session/route.ts`: **GET** (لقطة) و**POST** (فتح، مشرف فقط) + اختبار (403 للمساعد، idempotent، 404 `QUEUE_DISABLED`). DELETE يُضاف في T036. يعتمد T015, T016.
- [ ] T022 [P] [US1] `app/api/teacher/queue/code/route.ts` (GET/POST تجديد، مشرف) و`app/api/teacher/queue/settings/route.ts` (GET/PATCH) + اختبارات (صلاحيات، تدقيق التجديد، حد المعدّل). (FR-001, FR-013)
- [ ] T023 [P] [US1] `app/(teacher)/queue/print/page.tsx`: صفحة A4 للطباعة: اسم الحلقة، `QrSvg` (أسود/أبيض)، تعليمات قصيرة عربية («امسح الرمز بجوالك لتأخذ رقمك»)، زر «طباعة» و«تجديد الرمز» (مشرف) مع تحذير أنه يُبطل المطبوع؛ `@media print` يخفي الواجهة. (FR-012)

**Checkpoint**: US1 تعمل وحدها (طلاب يأخذون أرقاماً ويُسجَّل حضورهم).

---

## Phase 4: US2 — شاشة المسمِّع والمناداة (P1) 🎯 MVP

**Goal**: قائمتان، نداء ذرّي بلا تضارب، إشعار للطالب.

**Independent Test**: مسمِّعان على الجلسة نفسها؛ نداء الأول للرقم ٥ يمنع الثاني (409 + اسم الحاجز) في الواجهة والخادم.

- [ ] T024 [US2] اختبار (جزء النداء) في `lib/recitation-queue-entries-db.test.ts`: النداء الثاني على الدور نفسه يرجع `{ok:false, reason:'held', heldBy}`؛ النداء على `reviewing` يرجع `not_waiting`؛ `releaseEntry` للحاجز/المشرف فقط ويحتفظ بـ`queued_at`؛ أن نص SQL يحتوي `AND e.status = 'waiting'` (حارس ضد إعادة كتابة غير ذرّية). ثم تنفيذ `callEntry`, `releaseEntry` في `lib/recitation-queue-entries-db.ts` (يتسلسل بعد T017 — نفس الملف).
- [ ] T025 [US2] مسارات `app/api/teacher/queue/entries/[id]/call/route.ts` و`.../release/route.ts` (+ اختبار: 409 `ALREADY_HELD` مع الاسم، 403 لمسمِّع غير حاجز، `override` للمشرف + حدث تدقيق، Push يُجدول عبر `after()` بسقف ٣ث ولا يفشل النداء إن فشل). يعتمد T024, T012.
- [ ] T026 [US2] `components/queue-board.tsx` + `app/(teacher)/queue/page.tsx`: ثلاثة أقسام (المنتظرون بالترتيب، عند المسمِّعين مع اسم الحاجز، لم يمسحوا) + مراجعون/منتهون مطويان؛ زر «نادِ» لكل منتظر (يُخفى/يتعطل لمن عند غيره)؛ «لم يحضر» و«فك الحجز» (مشرف)؛ فتح/إغلاق الجلسة (مشرف)؛ استطلاع ٤ث بـ`v`؛ أزرار كبيرة وRTL و375px؛ عنصر «الطابور» في `app/(teacher)/layout.tsx` عند التفعيل (يتسلسل بعد 001/T027). (FR-005..007, SC-002)
- [ ] T027 [P] [US2] رابط من قائمة «لم يمسحوا» إلى تعديل الحضور في صفحة `app/(teacher)/attendance/page.tsx` القائمة (تمرير الطالب/اليوم) — بلا نظام حضور جديد. (FR-004)

**Checkpoint**: US1+US2 = **MVP للطابور** (ينقصه تسجيل النتيجة — لا يُنشر منفرداً).

---

## Phase 5: US3 — نتيجة التسميع (P1)

**Goal**: ثلاث نتائج تحدّث الورد والدور.

**Independent Test**: «مضبوط» ⇒ ورد معتمد باسم المسمِّع؛ «يراجع» ⇒ بلا ورد ويعود الطالب بـ«جاهز»؛ «يكرر أكثر» ⇒ ورد + تنبيه؛ مضبوط بعد مراجعة ⇒ ورد واحد مع «المحاولة ٢».

- [ ] T028 [US3] اختبار `lib/recitation-queue-outcome-db.test.ts` (محاكاة معاملة): كل نتيجة تُنتج الحالة والحقول الصحيحة؛ الاستدعاء المكرر idempotent؛ `supersedePendingId` يُمرَّر عند وجود ورد طالب معلّق؛ فشل إنشاء الورد يُلغي تحديث الدور (ROLLBACK)؛ `masteryEligible` يمرَّر لمنح النقاط. ثم تنفيذ `lib/recitation-queue-outcome-db.ts` (`recordOutcome`) بمعاملة واحدة وفق contracts. يعتمد T009, T014, T024.
- [ ] T029 [US3] اختبار ثم تنفيذ `app/api/teacher/queue/entries/[id]/outcome/route.ts`: 400 بلا نطاق، 409 `NOT_CALLED`، 403 لغير الحاجز/المشرف، بعد النجاح: استدعاء `afterWardApproved()` من `lib/ward-notify.ts` (001/T017، T043): webhooks `progress.recorded` + `progress.approved`، وإشعار الطالب والولي («سمّعت اليوم: …»/«يكرر أكثر»)، ومنح النقاط إن كانت مفعّلة (`mastered` فقط عند `masteryEligible`) — في `after()` أو بعد الحفظ دون إفشاله. يعتمد T028.
- [ ] T030 [US3] `components/queue-outcome-sheet.tsx` ودمجها في `queue-board.tsx`: تظهر للحاجز فقط؛ تعرض ما حدده الطالب مسبقاً قابلاً للتعديل (`ward-input-by-unit`)، ثم ثلاثة أزرار كبيرة: «سمّع مضبوط»، «يرجع يراجع»، «يكمل لكن يكرر أكثر» (نقرتان بعد اكتمال التسميع بدون تعديل: SC-002)، وملاحظة اختيارية. (يتسلسل بعد T026 — نفس الملف)
- [ ] T031 [P] [US3] إظهار النتيجة للطالب: `student-queue-card` يعرض «سمّعت اليوم: …» أو «راجع ثم اضغط جاهز» أو تنبيه «يكرر أكثر»؛ وشارة «يكرر أكثر» في `components/ward-list.tsx` و`app/api/wards/mine/route.ts` و`app/api/parent/child/route.ts` (عبر `repeatMore` من T014).
- [ ] T032 [P] [US3] اختبار انحدار الأوراد: ورد الطابور يظهر في التقارير (`listApprovedWardLogs`) وفي `GET /api/v1` بنفس الشكل القياسي، ولا يتغير شكل حمولة `progress.approved` (snapshot).

**Checkpoint**: الطابور كاملاً للجلسة الواحدة. **MVP قابل للنشر** بعد البوابات.

---

## Phase 6: US4 — إغلاق الجلسة والحضور (P2)

**Goal**: إغلاق يدوي/تلقائي يحفظ الحضور ويُنهي الأدوار.

**Independent Test**: إغلاق جلسة فيها طلاب بحالات مختلفة ⇒ من لم يمسح غائب (إلا من لديه ورد)، والمتبقون `not_heard` بلا ورد؛ جلسة منسية تُغلق بعد المدة عند أول وصول.

- [ ] T033 [US4] اختبار ثم إضافة **DELETE** إلى `app/api/teacher/queue/session/route.ts` (مشرف فقط؛ يرجع `heard/notHeard/markedAbsent`؛ 404 بلا جلسة؛ تدقيق `session_close`). (يتسلسل بعد T021)
- [ ] T034 [US4] اختبار الإغلاق الكسول في `lib/recitation-queue-db.test.ts` (إضافة): `closeIfExpired` يُنفَّذ عند `scan` و`teacherSnapshot` و`studentView` و`openSession`، يُغلق بـ`close_reason='auto'`، ويملأ الغياب مرة واحدة (idempotent). وتعديل ما يلزم في `lib/recitation-queue-db.ts` و`lib/recitation-queue-snapshot-db.ts` و`lib/recitation-queue-entries-db.ts`.
- [ ] T035 [P] [US4] قاعدة الاحتفاظ: إضافة قاعدة حذف الجلسات المغلقة الأقدم من ٩٠ يوماً إلى `lib/retention-rules.ts` + تحديث `lib/retention.test.ts` (النص ثابت، مقيّد زمنياً). **تُدمج بعد تطبيق M3** وإلا يفشل التنظيف على جدول غير موجود.
- [ ] T036 [P] [US4] واجهة الإغلاق: ملخص الإغلاق في `queue-board.tsx` («سمّع ١٢ · لم يُسمَّع ٢ · غائب ٣») وعرض «آخر جلسة مغلقة» (يتسلسل بعد T030).

---

## Phase 7: Polish

- [ ] T037 [POL] سكربت تحقق يدوي من التزامن `scripts/queue-concurrency-check.mjs`: يطلق ٢٠ نداءً متوازياً لدور واحد من توكنَي مسمِّعَين ويتحقق أن نجاحاً واحداً فقط؛ **يعمل فقط على قاعدة غير إنتاجية بعد تطبيق M3 وبإذن المالك**، ولا يقرأ `.env` (يستقبل رابط الخدمة وكوكيات الجلسة كوسائط). (SC-003)
- [ ] T038 [P] [POL] لقطات بصرية 1440 و375، داكن وفاتح: شاشة المسمِّع، صفحة الطالب (كل الحالات)، صفحة الطباعة؛ تحقق عدم وجود تمرير أفقي والألوان من الهوية (QR فقط أسود/أبيض). (`~/.claude/tools/shot.mjs`)
- [ ] T039 [P] [POL] تحقق ملاءمة الجوال الحقيقي: فتح رابط الوجهة من جوال المالك على الشبكة المحلية وفق سكِل `mobile-preview-check`، واختبار مسح الطباعة بكاميرا الجوال من مسافة ١ متر.
- [ ] T040 [POL] البوابات من `web/`: `npx tsc --noEmit`، `npx eslint .` (0 أخطاء)، `npx vitest run`، `npm run build` — كلها خضراء قبل الدمج.
- [ ] T041 [POL] تحديث `README.md` (الطابور)، سجل الدروس/الذاكرة، رسالة كومت بالعربي، التحقق من نشر Vercel.

---

## Dependencies & Execution Order

- **Q0 (T004–T010)**: بلا اعتماد؛ توزَّع بالتوازي فوراً.
- **T001 + T002** ← T011 ← T012..T016 (T012/T013/T014 [P] بين بعض عدا ملفات 001 المشتركة).
- US1: T017 → T018؛ T019 بعد T016؛ T020 بعد T019 وT018؛ T021 بعد T016؛ T022/T023 [P] بعد T015.
- US2: T024 بعد T017 (نفس الملف) → T025 → T026؛ T027 [P].
- US3: T028 بعد T024 وT014 وT009 → T029 → T030؛ T031/T032 [P] بعد T029.
- US4: T033 بعد T021؛ T034 بعد T028؛ T035 بعد تطبيق M3.
- Polish بعد القصص.

### ملفات مشتركة تُفرض عليها المهام تسلسلاً

- `lib/recitation-queue-entries-db.ts`: T017 → T024 → (T034).
- `app/api/teacher/queue/session/route.ts`: T021 → T033.
- `components/queue-board.tsx`: T026 → T030 → T036.
- `lib/db.ts`: 001/T014 → 001/T015 → T014 (هنا).
- `lib/audit-log-entry.ts`: 001/T016 → T012 (هنا).

### Parallel Example (Q0)

```text
Task: T004/T005 lib/recitation-queue.ts
Task: T006/T007 lib/queue-code.ts
Task: T008/T009 lib/queue-outcome.ts
Task: T010 components/qr-svg.tsx
```

## Implementation Strategy

1. Q0 كاملة (يمكن البدء بها حتى قبل موافقة M3).
2. T001 + T002 ثم الأساسيات (T011–T016).
3. US1 ثم US2 ثم US3 — **لا نشر قبل اكتمال US3** (طابور بلا نتيجة).
4. US4 ثم الصقل. الإصدار الأول = US1+US2+US3+الإغلاق اليدوي (T033)، مع T034 في الإصدار نفسه.

## Notes

- لا تبعيات npm جديدة (`qrcode` موجود). لا قراءة `.env`. لا تطبيق مايقريشن من وكيل.
- كل نص واجهة بالعربية الفصحى المبسّطة؛ المسمِّع في الواجهة يُنادى باسم المعلّم كما سجّله (`teacherName`).
- لا يُغيَّر نظام الحضور القائم ولا رمزه الدوّار؛ نعيد استعمال `attendance` فقط.
