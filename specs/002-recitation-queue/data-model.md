# Data Model: طابور التسميع

> كل SQL أدناه **مقترح وغير مطبّق**. لا يُنسخ إلى `web/netlify/database/migrations/` ولا يُطبَّق إلا بعد موافقة المالك صراحة (الدستور III).
> المرجع في الأنواع: `halaqah_id` = `students.teacher_id` (معرّف الحلقة)، والمفتاح المركّب `(teacher_id, id)` للطالب — نمط `attendance` بالضبط.

## 1. المايقريشن M3 — `20261117000000_recitation_queue` (مقترحة — NOT applied, needs approval)

```sql
-- طابور التسميع بالباركود (الحلقات الجامعية). إضافي بالكامل وقابل للتشغيل المتكرر.
-- لا يمسّ أي جدول قائم سوى إضافة عمود nullable-safe إلى ward_logs.

-- 1) رمز الحلقة الثابت القابل للتجديد + تجاوز التفعيل لكل حلقة.
CREATE TABLE IF NOT EXISTS halaqah_queue_codes (
  halaqah_id        INTEGER     PRIMARY KEY REFERENCES halaqahs(id) ON DELETE CASCADE,
  code              TEXT        NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 16 AND 64),
  enabled_override  BOOLEAN,                      -- NULL = يتبع الفئة (queueDefault)، true/false = قرار المشرف
  rotated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) جلسة التسميع.
CREATE TABLE IF NOT EXISTS recitation_sessions (
  id           SERIAL      PRIMARY KEY,
  halaqah_id   INTEGER     NOT NULL REFERENCES halaqahs(id) ON DELETE CASCADE,
  date         TEXT        NOT NULL CHECK (date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),   -- بتوقيت الرياض
  status       TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by    INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at    TIMESTAMPTZ NOT NULL,              -- الإغلاق التلقائي (opened_at + المدة، الافتراضي ٤ ساعات)
  closed_at    TIMESTAMPTZ,
  closed_by    INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  close_reason TEXT        CHECK (close_reason IS NULL OR close_reason IN ('manual', 'auto')),
  next_number  INTEGER     NOT NULL DEFAULT 1,    -- مولّد الأرقام التسلسلية داخل الجلسة
  version      INTEGER     NOT NULL DEFAULT 1     -- يزداد مع كل تغيير؛ يخفف الاستطلاع
);
-- جلسة واحدة مفتوحة كحد أقصى لكل حلقة.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recitation_sessions_open
  ON recitation_sessions (halaqah_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_recitation_sessions_halaqah_opened
  ON recitation_sessions (halaqah_id, opened_at DESC);

-- 3) الدور في الطابور.
CREATE TABLE IF NOT EXISTS recitation_queue_entries (
  id          SERIAL      PRIMARY KEY,
  session_id  INTEGER     NOT NULL REFERENCES recitation_sessions(id) ON DELETE CASCADE,
  halaqah_id  INTEGER     NOT NULL,
  student_id  TEXT        NOT NULL,
  number      INTEGER     NOT NULL CHECK (number > 0),
  status      TEXT        NOT NULL DEFAULT 'waiting'
              CHECK (status IN ('waiting', 'called', 'reviewing', 'done', 'not_heard')),
  planned     JSONB,                              -- ما سيسمّعه الطالب (اختياري): {"hifz":{...},"review":[...]} أو {"hifzPages":{from,to}}
  held_by     INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,   -- المسمِّع الحاجز (status = called)
  called_at   TIMESTAMPTZ,
  queued_at   TIMESTAMPTZ NOT NULL DEFAULT now(), -- أساس الترتيب (يُحدَّث عند العودة بعد «يراجع»)
  finished_at TIMESTAMPTZ,
  attempt     INTEGER     NOT NULL DEFAULT 1 CHECK (attempt > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id),
  UNIQUE (session_id, number),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_queue_entries_session_status
  ON recitation_queue_entries (session_id, status, queued_at);

-- 4) كل «نداء/دور» لدى مسمِّع (يشمل التاريخ: لم يحضر، فُكّ حجزه، نتيجته).
CREATE TABLE IF NOT EXISTS recitation_attempts (
  id           SERIAL      PRIMARY KEY,
  entry_id     INTEGER     NOT NULL REFERENCES recitation_queue_entries(id) ON DELETE CASCADE,
  attempt_no   INTEGER     NOT NULL CHECK (attempt_no > 0),    -- = entry.attempt وقت النداء
  reciter_id   INTEGER     REFERENCES teachers(id) ON DELETE SET NULL,
  called_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  outcome      TEXT        CHECK (outcome IS NULL OR outcome IN ('mastered', 'review', 'repeat_more', 'no_show', 'released')),
  ward_log_id  INTEGER     REFERENCES ward_logs(id) ON DELETE SET NULL,
  note         TEXT
);
-- نداء مفتوح واحد (outcome IS NULL) لكل دور.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recitation_attempts_open
  ON recitation_attempts (entry_id) WHERE outcome IS NULL;
CREATE INDEX IF NOT EXISTS idx_recitation_attempts_entry ON recitation_attempts (entry_id);

-- 5) تنبيه «يكرر أكثر» للورد (يظهر للطالب وفي متابعته).
ALTER TABLE ward_logs ADD COLUMN IF NOT EXISTS repeat_more BOOLEAN NOT NULL DEFAULT FALSE;
```

**كيف تبقى البيانات القديمة صالحة**
- جداول جديدة كلها؛ العمود الوحيد المضاف `ward_logs.repeat_more` بقيمة افتراضية `FALSE` (Postgres يضيفه بلا إعادة كتابة صفوف في الإصدارات الحديثة) فكل ورد قديم `FALSE`.
- لا ارتباط عكسي: حذف جلسة قديمة (قاعدة الاحتفاظ ٩٠ يوماً) يحذف الأدوار والمحاولات تتابعياً، ولا يحذف أي ورد (`ward_log_id ... ON DELETE SET NULL` من الجهة الأخرى).
- لا تغيير في `/api/v1` ولا الويب هوكس: الحقل الجديد لا يدخل الحمولة.
- `attendance.checkin_source` عمود TEXT قائم بلا CHECK؛ القيمة `'queue'` لا تحتاج مايقريشن.
- يعتمد منطقياً على M1 (الفئة وأعمدة `recorded_via`) لكن **لا يعتمد عليها بنيوياً**: لا FK إليها. يمكن تطبيق M3 قبل M1 إن أُريد الطابور بالتفعيل اليدوي فقط، لكن `createApprovedWardLog` (001/T015) يحتاج M1 فيُنصح بتطبيق M1 أولاً.

## 2. الكيانات

| الكيان | الجدول | ملاحظات |
|---|---|---|
| Halaqah Queue Code | `halaqah_queue_codes` | صف واحد للحلقة؛ يُنشأ كسولاً عند أول طلب (`ensureCode`) |
| Recitation Session | `recitation_sessions` | واحدة مفتوحة كحد أقصى؛ `version` للاستطلاع |
| Queue Entry | `recitation_queue_entries` | الرقم ثابت للدور طوال الجلسة؛ الترتيب بـ`queued_at` |
| Recitation Attempt/Outcome | `recitation_attempts` | سجل كل نداء ونتيجته؛ يحمل رابط الورد |

### توليد الرقم دون فجوات ولا سباق

```sql
WITH bump AS (
  UPDATE recitation_sessions
     SET next_number = next_number + 1, version = version + 1
   WHERE id = $1 AND status = 'open' AND closes_at > now()
     AND NOT EXISTS (SELECT 1 FROM recitation_queue_entries WHERE session_id = $1 AND student_id = $3)
  RETURNING next_number - 1 AS n
)
INSERT INTO recitation_queue_entries (session_id, halaqah_id, student_id, number, planned)
SELECT $1, $2, $3, n, $4 FROM bump
RETURNING id, number;
```
صفر صفوف ⇒ إمّا الدور موجود (يُرجَع القائم) أو الجلسة مغلقة/منتهية (يُنفَّذ `closeIfExpired` ثم رسالة «لا توجد جلسة»). قفل صف الجلسة بـ`UPDATE` يسلسل المسح المتزامن.

### النداء الذرّي (FR-006، SC-003)

```sql
UPDATE recitation_queue_entries e
   SET status = 'called', held_by = $teacher, called_at = now()
  FROM recitation_sessions s
 WHERE e.id = $entry AND e.halaqah_id = $halaqah AND e.status = 'waiting'
   AND s.id = e.session_id AND s.status = 'open'
RETURNING e.id, e.student_id, e.number;
```
صفر صفوف ⇒ قراءة الدور: إن كان `called` يُرجَع 409 مع `heldBy` (اسم المسمِّع)، وإلا 404/409 حسب الحالة. ثم (في المعاملة نفسها) `INSERT INTO recitation_attempts … outcome NULL`.

## 3. الحالات (آلة حالة الدور)

```text
                          scan (جلسة مفتوحة)
 (لا دور) ─────────────────────────────────────────► waiting ◄──────────────┐
                                                        │                    │
                                       call (ذرّي)      ▼          release   │ ready / re-scan
                                                     called ──(لم يحضر / فك حجز)──► waiting (نفس queued_at)
                                                        │
                       ┌──────── outcome: mastered ─────┤
                       │        outcome: repeat_more ───┤
                       ▼                                ▼ outcome: review
                     done  (ورد معتمد)             reviewing ── ready / re-scan ──► waiting (queued_at = now، attempt+1 محفوظة)

 أي حالة ∈ {waiting, called, reviewing} ──close/auto-close──► not_heard   (done لا يتغيّر)
```

| الانتقال | من | إلى | المنفّذ | أثر جانبي |
|---|---|---|---|---|
| scan | — | `waiting` | الطالب | حضور `present` (`checkin_source='queue'`) |
| call | `waiting` | `called` | أي مسمِّع/مشرف في الحلقة | attempt مفتوح + Push للطالب |
| release (لم يحضر) | `called` | `waiting` | الحاجز أو المشرف | attempt يُغلق `no_show` |
| release (فك حجز) | `called` | `waiting` | المشرف | attempt `released` + تدقيق `security.queue.release_override` |
| outcome=mastered | `called` | `done` | الحاجز أو المشرف | ورد معتمد (`recorded_via='queue'`) |
| outcome=repeat_more | `called` | `done` | الحاجز أو المشرف | ورد معتمد + `repeat_more=true` |
| outcome=review | `called` | `reviewing` | الحاجز أو المشرف | `attempt = attempt + 1`، لا ورد، `held_by=NULL` |
| ready / re-scan | `reviewing` | `waiting` | الطالب | `queued_at = now()` |
| close | غير `done` | `not_heard` | المشرف أو تلقائي | حضور: غائب لمن لم يمسح (وليس لديه ورد اليوم) |

- `done` نهائي داخل الجلسة (لا يعود للطابور في الجلسة نفسها) — قرار افتراضي، سؤال Q-Q3.
- الأرقام ثابتة للدور؛ **الموضع** = ترتيب `queued_at` بين `waiting` (وليس الرقم). «عدد من قبلك» = عدد `waiting` بـ`queued_at` أقدم.

### حالة الجلسة

```text
 open ──close (manual)──► closed
  │
  └──closes_at <= now() (أول قراءة/كتابة)──► closed (auto)
```

## 4. القاعدة المشتقة: هل الطابور مفعّل للحلقة؟

`enabled = halaqah_queue_codes.enabled_override ?? profileFor(stage).queueDefault`
- بدون صف `halaqah_queue_codes`: تُستعمل قيمة الفئة (جامعي = مفعّل).
- لا تعتمد على أي ميزة جامع، فتعمل للحلقات المستقلة (بلا جامع).

## 5. تحويل النتيجة إلى ورد (`lib/queue-outcome.ts`)

| النتيجة | الورد | الحقول |
|---|---|---|
| `mastered` | معتمد، ورد واحد | `recorded_via='queue'`, `recorded_by_teacher_id`, `reviewed_by=المسمِّع`, نطاق من المسمِّع (الأصل مما حدده الطالب)، ملاحظة تلحق «(المحاولة N)» إن N>1، `repeat_more=false` |
| `repeat_more` | معتمد، ورد واحد | نفس السابق + `repeat_more=true` |
| `review` | لا ورد | الدور `reviewing`، attempt+1 |

- النطاق المطلوب: `hifz`/`hifzPages` أو `review` (واحد على الأقل) لـ`mastered` و`repeat_more` (400 بخلاف ذلك).
- ورد الطالب المعلّق ليومه (`new|seen`، `recorded_via='student'`) يُحدَّث ويُعتمد بدل إنشاء ثانٍ (`supersedePendingId`).
- بونس الإتقان في النقاط (001): `mastered` من `attempt = 1` فقط.
- المحاولة الثانية بعد «يرجع يراجع» ⇒ ورد واحد فقط (لأن «review» لم ينشئ ورداً).

## 6. الاحتفاظ والخصوصية

- قاعدة جديدة في `lib/retention-rules.ts`: `DELETE FROM recitation_sessions WHERE status='closed' AND closed_at < now() - interval '90 days'` (تتتابع إلى الأدوار والمحاولات).
- طلب حذف بيانات الطالب (PDPL): الجداول تحمل `students(teacher_id,id) ON DELETE CASCADE` فتُحذف تلقائياً مع الطالب.
- الرمز: سرّ منخفض الحساسية (يُطبع علناً)؛ لا يُسجَّل في سجلات الخادم ولا في سجل التدقيق (يُسجَّل `rotated` فقط).
