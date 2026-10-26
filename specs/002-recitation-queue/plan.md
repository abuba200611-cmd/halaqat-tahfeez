# Implementation Plan: طابور التسميع بالباركود (الحلقات الجامعية)

**Branch**: `spec-age-groups` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-recitation-queue/spec.md` (بعد جلسة Clarify 2026-10-26)

**يعتمد على**: `specs/001-age-group-ward-modes` — ملف الفئة (`queueDefault`)، `createApprovedWardLog`، `notifyWardDecision`، `ward-units` (إدخال الأوجه/الأجزاء)، وعمودا `ward_logs.recorded_via/recorded_by_teacher_id`.

## Summary

رمز QR ثابت مطبوع لكل حلقة يقود إلى `/student/queue?c=<code>`. المشرف يفتح «جلسة تسميع»؛ مسح الطالب (المسجّل دخول) داخل جلسة مفتوحة يعطيه رقماً تسلسلياً
ويسجّل حضوره في جدول `attendance` القائم. شاشة المسمِّع تعرض المنتظرين بالترتيب ومن لم يمسح؛ «نادِ» حجز ذرّي بتعبير SQL واحد (`UPDATE … WHERE status='waiting'`)
ثم إشعار Web Push. نتيجة التسميع ثلاث (مضبوط / يرجع يراجع / يكمل لكن يكرر أكثر)، والمضبوط والمتكرر ينشئان ورداً **معتمداً** بصيغة الورد القائمة.
التحديث الحي بالاستطلاع الدوري (٤ ثوانٍ) مع `version` للجلسة يقلّل الحمولة؛ لا WebSockets.

أربعة جداول جديدة وعمود واحد جديد (`ward_logs.repeat_more`) — **مقترحة وغير مطبّقة، تحتاج موافقة المالك**.

## Technical Context

**Language/Version**: TypeScript 5، React 19، Next.js 16.4.x (App Router؛ `params` كـ Promise؛ `after()` للإشعارات).

**Primary Dependencies**: موجودة فقط: `@netlify/database`، `web-push`، `qrcode` (يُستعمل أصلاً في `components/qr-checkin-panel.tsx`). **لا تبعيات جديدة.**

**Storage**: Postgres: `halaqah_queue_codes`, `recitation_sessions`, `recitation_queue_entries`, `recitation_attempts` + `ward_logs.repeat_more`.

**Testing**: vitest — آلة الحالة وترتيب الطابور وانتهاء الجلسة ورمز الحلقة وتحويل النتيجة إلى ورد كلها دوال نقية. طبقة DB بمحاكاة `db()` (نمط `lib/fees-db.test.ts`). سباق «نادِ» يُتحقق منه نصّياً بالاستعلام ويدوياً بسكربت على قاعدة غير إنتاجية (T037).

**Target Platform**: Vercel؛ المسمِّع والطالب على الجوال (375px)، RTL، داكن/فاتح.

**Constraints**: SC-001 ١٠ ثوانٍ من الكاميرا لرقم؛ SC-003 صفر مناداة مزدوجة؛ SC-004 إشعار ≤ ٥ث؛ SC-005 حضور كامل من المسح.

**Scale/Scope**: حلقة ≤ ٦٠ طالباً، ≤ ٥ مسمِّعين، استطلاع كل ٤ث ⇒ ≤ ~١٥ طلب/ث ذروة لحلقة؛ استعلامات مفهرسة بالجلسة.

### حقائق مؤكَّدة من الكود

| الحقيقة | المصدر | الأثر |
|---|---|---|
| حضور بالرمز الدوّار قائم: `recordQrCheckin(halaqahId, studentId, date)` يُدرج `present` مع `checkin_source='qr'` و`ON CONFLICT DO NOTHING` | `lib/attendance-db.ts:159` | نعمّمها بمعامل `source` (`'queue'`) — لا نظام حضور موازٍ (FR-004) |
| `attendance.checkin_source` عمود TEXT بلا CHECK | `20261110000000_error_grading` | نستطيع كتابة `'queue'` دون مايقريشن |
| الحضور الضمني (طالب أرسل ورداً) يُشتقّ بالكود ولا يُخزَّن؛ الصف المخزَّن = قرار صريح | `20261020000000_attendance` تعليق | عند الإغلاق لا نكتب `absent` لمن لديه ورد في ذلك اليوم |
| `qrAttendanceEnabledForHalaqah` مرتبط بميزة جامع `qr_attendance` | `lib/qr-checkin-db.ts` | الطابور **لا** يعتمد عليها (حلقات مستقلة تُدعم) |
| صفحة الوجهة `/student/checkin` تقرأ `?t=` ثم `history.replaceState` وبوابة الطالب تعيد الدخول | `app/(student)/student/checkin/page.tsx` | نكرر النمط حرفياً في `/student/queue` |
| `sendPushToStudent(halaqahId, studentId, payload)` لا يرمي أبداً؛ يُستعمل داخل `after()` بسقف ٣ث | `lib/push.ts`, `app/api/wards/route.ts` | إشعار «تفضّل عند الشيخ…» بالنمط نفسه |
| `currentTeacher()` يعيد `{id, halaqahId, role, teacherName}` ويُستبعد الموقوف | `lib/auth.ts`, `lib/db.ts Teacher` | الحلقة تأتي من الجلسة دائماً؛ المشرف = `role==='supervisor'` |
| `retention-rules.ts` قواعد DELETE زمنية ثابتة النص | `lib/retention-rules.ts` | نضيف قاعدة جلسات مغلقة أقدم من ٩٠ يوماً (PDPL) |
| لا cron مخصص للطابور؛ `vercel.json` فيه cron يومي واحد | `vercel.json` | الإغلاق التلقائي **كسول**: عند أي قراءة/كتابة تتحقق `closes_at` (لا cron جديد) |
| اسم «recitations» محجوز للتلاوات الصوتية (STEP 64) | `lib/recitations*.ts`, جدول `recitations` | نستعمل بادئة `recitation_queue_*` / `queue` في المسارات لتفادي اللبس |

## Constitution Check

| المبدأ | الحكم | ملاحظة |
|---|---|---|
| I القرآن والحلقة أولاً | **مراعى** | تنظيم الدور في الحلقة؛ لا منتج مباع. «المسمِّع» و«الشيخ» بمسمّيات الحلقات؛ التسمية في الواجهة تتبع `teacherName`. |
| II الخصوصية والأمان | **مراعى** | الرمز ثابت لكنه لا يمنح شيئاً بلا جلسة طالب من الحلقة نفسها؛ المسح يُقبل داخل جلسة مفتوحة فقط؛ الحجز على الخادم؛ حدود معدّل لكل مسار؛ أحداث `security.queue.*` (فتح/إغلاق/تجديد رمز/فك حجز). الرمز يُزال من شريط العنوان. المحتوى المخزَّن: معرّف الطالب ورقمه ووقته فقط، واحتفاظ ٩٠ يوماً. |
| III قاعدة بيانات إضافية فقط | **مراعى مع شرط** | `IF NOT EXISTS` فقط. **لا تُطبَّق قبل موافقة المالك** (T001). تعذّر JSON القائم: بيانات الجلسة علائقية بطبيعتها. |
| IV الاختبار والبوابات | **مراعى** | `lib/recitation-queue.ts` (آلة حالة نقية) وبقية الدوال النقية باختبارات تسبق التنفيذ؛ البوابات الأربع قبل الدمج. |
| V الهوية البصرية | **مراعى** | الشاشات برموز الهوية؛ **استثناء مقصود**: رمز QR أسود على أبيض (FR-012، تعليق `qr-checkin-panel`)، وصفحة الطباعة A4 بيضاء. |
| VI تصميم طويل المدى | **مراعى** | مدة الإغلاق التلقائي معامل (افتراضي ٤ ساعات) لا ثابت؛ `enabled_override` يسمح لأي فئة؛ الجلسات/المحاولات تاريخية فتدعم تقارير لاحقة. |
| VII البساطة لكل فئة | **مراعى** | الطالب: مسح ثم رقم؛ المسمِّع: «نادِ» ثم ٣ أزرار نتيجة. |

### تتبّع التعقيد

| الانحراف | لماذا لازم | البديل المرفوض |
|---|---|---|
| ٤ جداول جديدة | الجلسة والدور والمحاولة كيانات مختلفة بدورات حياة مختلفة (FR-002/003/008) | جدول واحد مسطّح لا يحفظ محاولات متعددة ولا تاريخ المناداة |
| عمود `ward_logs.repeat_more` | تنبيه «يكرر أكثر» يجب أن يظهر في متابعة الطالب والولي (FR-008) | JOIN مع جدول المحاولات في كل استعلام أوراد |
| تحديث ورد الطالب المعلّق عند «مضبوط» (تفادي ازدواج) | الجامعي قد يسجّل ورده بنفسه ثم يسمّع | إنشاء ورد ثانٍ ⇒ ورد معلّق في الوارد + معتمد = ازدواج ظاهري |
| استعلام التجميع للمسمِّع (قوائم من/لم يمسح) بالاستطلاع | الدستور/المواصفة: لا WebSockets | SSE/WebSocket خارج النطاق وتتعارض مع قيود Vercel |

## Project Structure

### Documentation

```text
specs/002-recitation-queue/
├── spec.md
├── plan.md             # هذا الملف
├── data-model.md
├── contracts/
│   ├── teacher-queue.md
│   └── student-queue.md
└── tasks.md
```

### Source Code (`web/`)

**ملفات جديدة**

```text
lib/recitation-queue.ts            + .test.ts  # آلة الحالة، ترتيب الطابور، الموضع، انتهاء الجلسة، نتائج→أفعال
lib/queue-code.ts                  + .test.ts  # توليد الرمز، التحقق من الصيغة، مسار الوجهة
lib/queue-outcome.ts               + .test.ts  # نتيجة → مسودة ورد (النطاق، الملاحظة، المحاولة، repeat_more)
lib/recitation-queue-db.ts                     # الرمز + الجلسة (فتح/إغلاق/إغلاق كسول/لقطة)
lib/recitation-queue-entries-db.ts             # مسح، جاهز، نداء ذرّي، لم يحضر، فك حجز
lib/recitation-queue-outcome-db.ts             # معاملة النتيجة (إنهاء الدور + إنشاء الورد + المحاولة)
app/api/teacher/queue/session/route.ts         # GET لقطة، POST فتح، DELETE إغلاق
app/api/teacher/queue/code/route.ts            # GET الرمز/مسار الطباعة، POST تجديد
app/api/teacher/queue/settings/route.ts        # GET/PATCH enabled_override
app/api/teacher/queue/entries/[id]/call/route.ts
app/api/teacher/queue/entries/[id]/release/route.ts
app/api/teacher/queue/entries/[id]/outcome/route.ts
app/api/student/queue/route.ts                 # GET حالتي
app/api/student/queue/scan/route.ts            # POST مسح
app/api/student/queue/ready/route.ts           # POST جاهز مجدداً
app/api/student/queue/planned/route.ts         # PATCH ما سأسمّعه
components/qr-svg.tsx                          # QrSvg مستخرج من qr-checkin-panel
components/queue-board.tsx                     # شاشة المسمِّع (منتظرون/عند المسمِّعين/لم يمسحوا)
components/queue-outcome-sheet.tsx             # ورقة تسجيل النتيجة (تعديل الورد + ٣ أزرار)
components/student-queue-card.tsx              # رقم الطالب وحالته
app/(teacher)/queue/page.tsx                   # شاشة المسمِّع/المشرف
app/(teacher)/queue/print/page.tsx             # صفحة طباعة A4
app/(student)/student/queue/page.tsx           # وجهة الرمز + حالة الطالب
netlify/database/migrations/20261117000000_recitation_queue/migration.sql   # مقترحة — لا تُطبَّق
```

**ملفات معدَّلة**

```text
lib/attendance-db.ts               # recordQrCheckin(…, source = "qr")؛ fillAbsentForClosedSession()
lib/db.ts + lib/types.ts           # WardLog.repeatMore؛ createApprovedWardLog خيار supersedePendingId
lib/audit-log-entry.ts             # queue.session_open/close, queue.code_rotate, queue.release_override
lib/retention-rules.ts (+ test)    # حذف الجلسات المغلقة الأقدم من ٩٠ يوماً
lib/ward-notify.ts                 # (من 001) emitApprovedWardEvents يُستعمل هنا
components/qr-checkin-panel.tsx    # يستورد QrSvg من components/qr-svg.tsx (بلا تغيير سلوك)
app/(teacher)/layout.tsx           # عنصر «الطابور» حسب التفعيل
app/(student)/student/ ... nav     # عنصر «الطابور» حسب التفعيل (حدِّد ملف الملاحة)
app/api/wards/mine/route.ts, app/api/parent/child/route.ts   # repeatMore
```

**Structure Decision**: نفس طبقات المشروع (منطق نقي ← DB ← مسار رفيع ← واجهة). كل مسارات المسمِّع تحت `/api/teacher/queue` وكل مسارات الطالب تحت `/api/student/queue`
(الحلقة والمعرّفات من الجلسة فقط؛ `entries/[id]` يُتحقق من انتماء الدور لحلقة المعلّم داخل الاستعلام نفسه).

## Phased approach

| المرحلة | المحتوى | مايقريشن |
|---|---|---|
| **Q0** | دوال نقية + اختباراتها (آلة الحالة، الرمز، النتيجة→الورد) | لا |
| **Q1 (MVP)** | M3 → رمز الحلقة + فتح/إغلاق الجلسة + المسح والرقم والحضور (US1) + شاشة المسمِّع والنداء الذرّي (US2) | M3 |
| **Q2** | نتائج التسميع الثلاث وإنشاء الورد (US3) | M3 |
| **Q3** | الإغلاق، الحضور النهائي، الإغلاق التلقائي الكسول، الاحتفاظ (US4) | M3 |
| **Q4** | صفحة الطباعة، الصقل، اللقطات، سكربت التزامن اليدوي | لا |

> MVP عملي: Q1 + Q2 معاً (طابور بلا نتيجة غير مفيد). Q3 يمكن أن يسبقه إغلاق يدوي بسيط، لكن ملء الغياب والإغلاق الكسول يخرجان في نفس الإصدار تجنباً لجلسات معلّقة.

## Risks

| الخطر | الأثر | التخفيف |
|---|---|---|
| سباق «نادِ» | طالب عند مسمِّعَين (SC-003) | `UPDATE … SET status='called', held_by=$t WHERE id=$e AND status='waiting' AND halaqah_id=$h AND session open RETURNING` — صفر صفوف ⇒ 409 مع اسم الحاجز؛ لا قراءة ثم كتابة |
| جلستان مفتوحتان لحلقة | رقمان وتشويش | فهرس فريد جزئي `WHERE status='open'` + معالجة تعارض الإدراج بإرجاع الجلسة القائمة |
| مسح من البيت بصورة الرمز | حضور زائف | مقبول تقنياً حسب المواصفة؛ المسمِّع يضغط «لم يحضر»، والمشرف يصحّح الحضور؛ تحسين لاحق: رمز متغيّر (موجود أصلاً) — موثَّق في ANALYZE |
| استطلاع كثيف | حمل | `version` يعيد `{unchanged:true}`؛ استعلام واحد مفهرس؛ حد معدّل سخي لكن مقيّد |
| انقطاع المسمِّع بعد النداء | طالب محجوز للأبد | المشرف يفك أي حجز؛ لقطة المسمِّع تُظهر مدة الحجز؛ (اختياري لاحقاً: انتهاء حجز تلقائي — سؤال Q-Q4) |
| ازدواج ورد الطالب مع الطابور | تضخم التقارير | دمج تحت `supersedePendingId` داخل المعاملة |
| إغلاق كسول لا يُنفَّذ إن لم يزر أحد | جلسة معلّقة، حضور ناقص | أي مسار مسح/لقطة/فتح جلسة جديدة ينفّذ `closeIfExpired` أولاً؛ الحضور الغائب يُملأ وقتها |
| تسرّب الرمز المطبوع | دخول طلاب من حلقة أخرى | الرمز يُقارَن بحلقة جلسة الطالب (403)؛ والتجديد متاح للمشرف فوراً |
