# Implementation Plan: أنماط تسجيل الورد حسب الفئة العمرية للحلقة

**Branch**: `spec-age-groups` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/001-age-group-ward-modes/spec.md` (بعد جلسة Clarify 2026-10-26)

## Summary

نضيف «فئة» لكل حلقة (`primary | intermediate | secondary | university`، والقيمة الفارغة = النمط الحالي دون أي تغيير).
الفئة تُترجم في الكود إلى **ملف نمط ثابت (Stage Profile)** في ملف نقي واحد يحدد: وحدة الإدخال/العرض، هل يسجّل المعلّم عن الطالب،
سياسة الاعتماد الابتدائية، تفعيل النقاط، وإظهار الكبرى/الصغرى. كل الواجهات والمسارات تقرأ هذا الملف فقط (مصدر حقيقة واحد، المبدأ VI).

التقنية:
- عمود واحد جديد `halaqahs.stage` (لا يوجد JSON إعدادات للحلقة — وهو المبرر الوحيد لعمود جديد).
- ورد المعلّم عن الطالب: مسار جديد `POST /api/teacher/wards` يعيد استخدام `parseAyahRange`/`parseReviewSegments` وصيغة `NewWardLog`،
  ويُنشئ الورد **معتمداً** عبر دالة مشتركة `createApprovedWardLog` (تُستعمل أيضاً في طابور التسميع 002).
- وحدة القياس: تغيير إدخال/عرض فقط. التخزين يبقى سورة/آية + صفحات؛ إدخال الصفحات يُحوَّل إلى نطاق آيات عبر دالة نقية جديدة
  `ayahRangeOfPageRange` فيبقى كل شيء قائماً على الآيات (webhooks، error-grading، juz-progress) بلا تغيير.
- النقاط: دفتر حركات append-only (`points_ledger`) + جوائز (`rewards`) + طلبات استبدال (`reward_redemptions`)، والرصيد = مجموع الحركات.
  قيم النقاط تخزَّن في `mosque_features.config` (ميزة جديدة `stage_points`) لا في أعمدة (المبدأ III).
- الكبرى/الصغرى: دالة نقية تجمع إعداد الجامع (`review_tracks`) مع ملف الفئة؛ إعداد الجامع يتقدّم.

## Technical Context

**Language/Version**: TypeScript 5، Node (Vercel)، React 19، Next.js 16.4.x (App Router، `params` كـ Promise، `after()`، `proxy.ts`)

**Primary Dependencies**: موجودة فقط — `@netlify/database` (db().sql / pool)، `web-push`، `qrcode`. **لا تبعيات npm جديدة.**

**Storage**: Postgres. تغييران إضافيان: عمود/أعمدة (M1) وثلاثة جداول (M2) — **مقترحة وغير مطبّقة، تحتاج موافقة المالك**.

**Testing**: vitest (`npx vitest run`) — دوال نقية في `web/lib/*.test.ts`، واختبارات مسارات بنمط `app/api/wards/route.test.ts` (محاكاة `@/lib/db`).

**Target Platform**: Vercel (من `main`)، الجوال أولاً (375px)، RTL.

**Project Type**: web-service (Next.js مونوليث في `web/`).

**Performance Goals**: SC-001 (١٠ طلاب < ٥ دقائق) = نموذج بنقرتين/ثلاث لكل طالب وانتقال تلقائي للتالي بلا إعادة تحميل.

**Constraints**: لا تغيير في عقد `/api/v1` ولا حمولات webhooks؛ الأوراد القديمة تبقى صالحة (SC-003)؛ الحلقات القائمة بلا تغيير حتى يختار المشرف فئة (SC-005).

**Scale/Scope**: عشرات الحلقات لكل جامع، ≤ ٣٠ طالباً للحلقة.

### حقائق مؤكَّدة من الكود (تؤثر على التصميم)

| الحقيقة | المصدر | الأثر |
|---|---|---|
| `halaqah_id` في الجداول = `students.teacher_id` (المفتاح المركّب `(teacher_id, id)`)؛ `student.teacherId` في الجلسة هو معرّف الحلقة | `20260727000000_initial`, `lib/auth.ts` | كل جداولنا الجديدة تستخدم `(halaqah_id, student_id)` بنمط `attendance` |
| `setWardLogStatus` يرفض `needs_revision` لورد `approved` (`status <> 'approved'`) | `lib/db.ts ~1618` | يتعارض مع FR-009 — انظر «تتبّع التعقيد» و`ANALYZE.md` |
| `createWardLog` يُدرج دائماً `'new'` ويستنتج `previous_attempt_id` | `lib/db.ts ~1127` | نحتاج `createApprovedWardLog` (إدراج معتمد + `reviewed_by`) |
| `ward_logs` بلا عمود «من سجّله» | `lib/types.ts WardLog` | عمودان جديدان (M1) |
| الأوراد المسجّلة بالصفحات فقط (`hifzAyah = null`) شكل قديم مقبول | `WardLog.hifzAyah` تعليق | لكننا نفضّل التحويل لآيات للحفاظ على webhooks/error-grading |
| الإشعارات: `sendPushToStudent/Parents/Halaqah` + `after()` وسقف ٣ث | `lib/push.ts`, `app/api/wards/route.ts` | نستخرج كتلة إشعار القرار إلى `lib/ward-notify.ts` لتستعملها 001 و002 |
| `reviewTrackConfigForHalaqah` يقرأ ميزة `review_tracks` | `lib/mosque/review-tracks-db.ts` | نلفّه بدالة حاضرة للفئة |
| عدّاد الحدّ `checkRateLimit(key, limit, windowSeconds)` | `lib/rate-limit.ts` | كل مسار كتابة جديد يضيف مفتاحاً |
| CSRF مركزي في `proxy.ts` للمسارات غير الآمنة | `lib/csrf.ts` | لا شيء مطلوب سوى عدم استثناء مساراتنا |
| `logSecurityEvent` ببادئة `security.` وأنواع أحداث مغلقة | `lib/audit-log-entry.ts` | نضيف أنواعاً جديدة |
| نمط مسارات الأدمن: `/api/mosques/[id]/...` مع `canAccessMosque` | `app/api/mosques/[id]/halaqahs/route.ts` | مدير الجامع يغيّر الفئة من مسار تحته |

## Constitution Check

| المبدأ | الحكم | ملاحظة |
|---|---|---|
| I القرآن والحلقة أولاً — لا تسليع | **مراعى** | النقاط/الجوائز تحفيز تربوي يحدده المعلّم/الجامع، لا منتج يُباع ولا متجر؛ لا مقارنات عامة بين الأطفال. |
| II الخصوصية والأمان | **مراعى** | FR-013 (قاصرون): مهمة تدقيق ظهور أسماء طلاب الابتدائي (زملاء الحلقة، لوحة الشرف). كل مسار جديد: CSRF مركزي + `checkRateLimit` + `currentTeacher()`/`currentStudent()`. أحداث `security.halaqah.stage_change` و`security.points.*`. لا قراءة `.env`. |
| III قاعدة بيانات إضافية فقط | **مراعى مع شرط** | M1/M2 `IF NOT EXISTS` فقط، لا حذف ولا إعادة تسمية. قيم النقاط في `mosque_features.config`. **كل المايقريشنز بانتظار موافقة المالك ولا تُطبَّق** (T001/T002). |
| IV الاختبار والبوابات | **مراعى** | منطق نقي في `lib/halaqah-stage.ts`, `lib/ward-units.ts`, `lib/ward-policy.ts`, `lib/points.ts`, `lib/stage-review-tracks.ts` مع اختبارات تُكتب أولاً. البوابات الأربع قبل الدمج. |
| V الهوية البصرية | **مراعى** | رموز الهوية فقط؛ نجوم النقاط بـSVG مباشر بلون الأكسنت/`bg-accent-soft`؛ لقطات 1440 و375 داكن/فاتح قبل الدمج. |
| VI تصميم طويل المدى | **مراعى** | ملف الفئة مصدر وحيد؛ قيم النقاط قابلة للتعديل لكل جامع؛ `stage = NULL` يحفظ السلوك القديم؛ لا كسر لـ`/api/v1`. |
| VII البساطة لكل فئة | **مراعى** | الابتدائي: أزرار كبيرة وتتابع؛ الجامعي: سرعة؛ إخفاء ما لا يخص الفئة. |

### تتبّع التعقيد (انتهاكات مبرَّرة)

| الانحراف | لماذا لازم | البديل الأبسط المرفوض |
|---|---|---|
| عمود جديد على `halaqahs` رغم تفضيل JSON (III) | لا يوجد JSON إعدادات للحلقة؛ الفئة تؤثر على كل استعلام وتُقرأ في مسار حرج | تخزينها في `mosque_features.config` مرفوض: الحلقات المستقلة بلا جامع لا صف ميزة لها |
| عمودان جديدان على `ward_logs` (`recorded_by_teacher_id`, `recorded_via`) | FR-003 يشترط حفظ «من سجّله»؛ لا عمود يحمله | جدول جانبي يتطلب JOIN في كل قراءة أوراد؛ العمودان nullable وآمنان (NULL = طالب) |
| السماح بـ`approved → needs_revision` (FR-009) يخالف القاعدة الحالية «لا رجوع عن اعتماد» | نص المواصفة FR-009 صريح | إبقاء القاعدة يخالف المواصفة. **التضييق**: الرجوع مسموح فقط للأوراد التي `recorded_via IN ('teacher','queue')`، وأوراد الطالب المعتمدة يدوياً تبقى نهائية كما هي (لا تغيير في سلوك قائم). يُعرض على المالك في `ANALYZE.md` |
| مايقريشنان منفصلان (M1/M2) | تمكين الموافقة المرحلية: MVP لا يحتاج جداول النقاط | مايقريشن واحدة تُلزم المالك بالموافقة على النقاط قبل أن نبدأ |

## Project Structure

### Documentation (this feature)

```text
specs/001-age-group-ward-modes/
├── spec.md
├── plan.md              # هذا الملف
├── data-model.md
├── contracts/
│   ├── stage-settings.md
│   ├── teacher-wards.md
│   ├── ward-changes.md
│   └── points-rewards.md
└── tasks.md
```

### Source Code (`web/`) — كل المسارات نسبة إلى `web/`

**ملفات جديدة**

```text
lib/halaqah-stage.ts              + .test.ts   # STAGES, StageProfile, profileFor(stage|null), labels (Arabic)
lib/ward-units.ts                 + .test.ts   # formatWardByUnit, parsePagesInput → AyahRange, وجه/جزء labels
lib/ward-policy.ts                + .test.ts   # initialStatusFor(), canTeacherRecord(), findSameDayDuplicate(), canReopen()
lib/points.ts                     + .test.ts   # pointsForApproval(), balanceOf(), validateRedemption(), config parse/clamp
lib/stage-review-tracks.ts        + .test.ts   # reviewTracksVisible(stageProfile, mosqueConfig)
lib/halaqah-stage-db.ts                         # getHalaqahStage / setHalaqahStage (+ mosque ownership check)
lib/ward-notify.ts                              # notifyWardDecision() مستخرجة من PATCH /api/wards (سلوك مطابق)
lib/points-db.ts                  + .test.ts   # append-only ledger, award (idempotent), redeem tx, cancel, deliver
lib/points-config.ts              + .test.ts   # قراءة/كتابة config ميزة stage_points
app/api/teacher/wards/route.ts              + route.test.ts   # POST تسجيل المعلّم
app/api/teacher/wards/roster/route.ts                         # GET طلاب الحلقة + حالة ورد اليوم
app/api/mosques/[id]/halaqahs/[halaqahId]/stage/route.ts      # PATCH فئة (مدير الجامع)
app/api/mosques/[id]/points/route.ts                          # GET/PATCH قيم النقاط للجامع
app/api/teacher/rewards/route.ts, app/api/teacher/rewards/[id]/route.ts
app/api/teacher/redemptions/route.ts, app/api/teacher/redemptions/[id]/route.ts
app/api/rewards/redeem/route.ts                               # الطالب يطلب
app/api/parent/redeem/route.ts                                # ولي الأمر يطلب عن ابنه
app/api/student/points/route.ts, app/api/parent/points/route.ts
components/teacher-ward-form.tsx          # نموذج سريع بأزرار كبيرة وتتابع
components/ward-input-by-unit.tsx         # حقول الإدخال حسب وحدة الفئة (يلفّ ayah-range-field)
components/points-card.tsx                # رصيد + نجوم + جوائز (طالب/ولي أمر)
app/(teacher)/record/page.tsx             # شاشة «تسجيل الورد» المتتابعة
app/(teacher)/rewards/page.tsx            # إدارة الجوائز وطلبات الاستبدال
app/(student)/student/rewards/page.tsx
```

**ملفات معدَّلة**

```text
lib/types.ts                         # WardLog += recordedByTeacherId, recordedVia; StudentAccount/Profile += stage
lib/db.ts                            # أعمدة جديدة في SELECTs، createApprovedWardLog، reopenApprovedWard
lib/quran-surahs.ts (+ .test.ts)     # ayahRangeOfPageRange (الدالة العكسية لـpageRangeOfAyahRange)
lib/student-ward-display.ts (+ .test.ts)  # عرض حسب الوحدة
lib/audit-log-entry.ts               # أحداث: halaqah.stage_change, points.redeem, points.cancel, points.reward_edit
lib/mosque/features.ts               # ميزة stage_points (defaultEnabled: true)
lib/mosque/review-tracks-db.ts       # reviewTrackConfigForHalaqah يمرّر عبر stage-review-tracks
app/api/teacher/settings/route.ts (+ route.test.ts)   # GET يرجع stage؛ PATCH يقبل stage (مشرف)
app/api/wards/route.ts (+ route.test.ts)   # POST: hifzPages + حارس التكرار؛ PATCH: يستدعي ward-notify + إتاحة reopen + منح النقاط
app/api/wards/mine/route.ts, app/api/student/progress/route.ts  # stage + points
app/api/parent/child/route.ts        # recordedVia + اسم المعلّم + نقاط
components/halaqah-settings.tsx, app/(teacher)/settings/page.tsx  # اختيار الفئة
app/(student)/student/log/page.tsx, app/(student)/student/wards/page.tsx, components/ward-list.tsx
app/(teacher)/inbox/page.tsx         # زر «طلب إعادة» لورد معتمد من المعلّم + شارة «سجّله المعلّم»
app/(teacher)/students/[id]/page.tsx # زر «تسجيل ورد» للابتدائي فقط
app/(teacher)/layout.tsx             # عنصر قائمة «تسجيل الورد» و«الجوائز» حسب الفئة
app/(mosque)/mosque/...              # قائمة حلقات الجامع: محدّد الفئة (يُحدَّد الملف الدقيق في T020)
netlify/database/migrations/20261115000000_halaqah_stages/migration.sql   # مقترحة — لا تُطبَّق
netlify/database/migrations/20261116000000_points_rewards/migration.sql   # مقترحة — لا تُطبَّق
```

**Structure Decision**: نمط المشروع القائم — منطق نقي في `lib/*.ts` مع اختبار مجاور، طبقة DB منفصلة `*-db.ts` بـ`import "server-only"`،
مسارات رفيعة تتحقق من الجلسة والمعدّل ثم تستدعي lib. لا مجلدات جديدة.

## Phased approach

| المرحلة | المحتوى | يحتاج موافقة مايقريشن؟ |
|---|---|---|
| **P0** | منطق نقي + اختباراته: ملف الفئة، وحدات القياس، سياسة الاعتماد، النقاط، تصنيف الكبرى/الصغرى، `ayahRangeOfPageRange` | لا — يمكن البدء فوراً |
| **P1 (MVP)** | M1 → إعداد الفئة (US1) + تسجيل المعلّم للابتدائي (US2) + حارس التكرار | M1 |
| **P2** | وحدات القياس (US3) + سياسة الاعتماد وإعادة فتح المعتمد (US4) | M1 |
| **P3** | M2 → النقاط والجوائز (US5) | M2 |
| **P4** | الكبرى/الصغرى حسب الفئة (US6) + تدقيق خصوصية القاصرين (FR-013) + صقل | لا |

ملاحظة: US3 (وحدات القياس) و US6 لا تحتاج M1 *للعمل المنطقي*، لكنها تحتاج قراءة الفئة فتتأخر خلف M1 عملياً.

## Risks

| الخطر | الأثر | التخفيف |
|---|---|---|
| كسر `app/api/wards/route.ts` أثناء استخراج الإشعارات | الأوراد الحالية | استخراج بلا تغيير سلوك + `route.test.ts` الحالي يبقى أخضر قبل أي إضافة |
| ازدواج ورد الطالب والمعلّم (FR-005) | بيانات مكررة في التقارير | حارس خادمي بتاريخ الرياض + تأكيد صريح (`409 DUPLICATE_TODAY`) من الجهتين |
| سباق الاستبدال (رصيدان في لحظة واحدة) | رصيد سالب | معاملة + `pg_advisory_xact_lock(hashtext(halaqah:student))` + قيد `CHECK` على الرصيد عبر استعلام داخل المعاملة |
| منح نقاط مرتين لنفس الورد | رصيد متضخم | `UNIQUE (ward_log_id, kind)` على الدفتر + `ON CONFLICT DO NOTHING` |
| تغيير الفئة يربك الواجهات المفتوحة | عرض غير متسق | الفئة تُقرأ عند كل جلب؛ العرض يعتمد على الحاضر (إدخال/عرض فقط، لا تحويل بيانات) |
| ظهور أسماء قاصرين في لوحة الشرف/الزملاء | خصوصية (II) | مهمة تدقيق FR-013 قبل الإطلاق ومعيار قبول صريح |
| التحويل صفحات→آيات غير دقيق | بيانات خاطئة | اختبار شامل على كل الـ604 صفحة (round-trip مع `pageRangeOfAyahRange`) |
