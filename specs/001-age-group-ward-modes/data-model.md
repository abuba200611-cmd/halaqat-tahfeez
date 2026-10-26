# Data Model: أنماط تسجيل الورد حسب الفئة

> كل SQL أدناه **مقترح وغير مطبّق**. لا يُنسخ إلى `web/netlify/database/migrations/` ولا يُطبَّق إلا بعد موافقة المالك صراحة (الدستور III).

## 1. ما يُخزَّن في الكود (لا قاعدة بيانات)

### Stage Profile — `lib/halaqah-stage.ts`

```ts
export const STAGES = ["primary", "intermediate", "secondary", "university"] as const;
export type HalaqahStage = (typeof STAGES)[number];

export type WardUnit = "surah_ayah" | "ayah_page" | "page_wajh" | "wajh_juz";

export type StageProfile = {
  stage: HalaqahStage | "legacy";   // "legacy" = العمود NULL
  labelAr: string;                  // ابتدائي / متوسط / ثانوي / جامعي وكبار / (افتراضي)
  unit: WardUnit;                   // وحدة الإدخال والعرض
  teacherRecords: boolean;          // المعلّم يسجّل عن الطالب (primary فقط)
  autoApproveOnTeacherRecord: boolean;
  studentSelfApproval: "manual" | "queue";   // primary: n/a؛ intermediate/secondary: manual؛ university: queue
  pointsDefault: boolean;           // primary فقط افتراضياً (قابل للتجاوز من إعداد الجامع)
  reviewTracksDefault: boolean;     // primary=false، الباقي true، legacy=true (السلوك الحالي)
  queueDefault: boolean;            // university=true (يستعمله 002)
};
```

| الفئة | unit | teacherRecords | studentSelfApproval | pointsDefault | reviewTracksDefault | queueDefault |
|---|---|---|---|---|---|---|
| `primary` | `surah_ayah` | نعم | — (يسجّل المعلّم معتمداً) | نعم | لا | لا |
| `intermediate` | `ayah_page` | لا | manual | لا | نعم | لا |
| `secondary` | `page_wajh` | لا | manual | لا | نعم | لا |
| `university` | `wajh_juz` | لا | queue (والـmanual يبقى متاحاً) | لا | نعم | نعم |
| NULL (`legacy`) | `ayah_page` (= الحالي) | لا | manual | لا | نعم | لا |

> «وجه» في الواجهة: افتراض أنه = صفحة مصحف واحدة (٦٠٤ وجه). انظر سؤال المالك Q3 في `ANALYZE.md`.

### سياسة النقاط — `mosque_features.config` (ميزة `stage_points`)

لا عمود جديد: صف في `mosque_features` بمفتاح `stage_points`، وعمود `enabled` القائم هو المفتاح العام.

```json
{
  "stages": ["primary"],
  "perApproved": 1,
  "masteryBonus": 1,
  "masteryMinScore": 90
}
```

التحقق والقص في `lib/points.ts: parsePointsConfig()` (القيم خارج النطاق تُصحَّح؛ مفاتيح غريبة تُسقط). حلقة بلا جامع = الافتراضيات
(`stages: ["primary"], perApproved: 1, masteryBonus: 1`). الأوراد القديمة لا تُمنح نقاطاً بأثر رجعي.

## 2. المايقريشن M1 — `20261115000000_halaqah_stages` (مقترحة — NOT applied, needs approval)

```sql
-- فئة الحلقة + من سجّل الورد. إضافي بحت وقابل للتشغيل المتكرر.
-- NULL في halaqahs.stage = النمط الحالي دون أي تغيير (SC-005).
-- NULL في ward_logs.recorded_via = ورد قديم سجّله الطالب بنفسه.

ALTER TABLE halaqahs
  ADD COLUMN IF NOT EXISTS stage TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'halaqahs_stage_check'
  ) THEN
    ALTER TABLE halaqahs ADD CONSTRAINT halaqahs_stage_check
      CHECK (stage IS NULL OR stage IN ('primary', 'intermediate', 'secondary', 'university'));
  END IF;
END $$;

ALTER TABLE ward_logs
  ADD COLUMN IF NOT EXISTS recorded_by_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recorded_via TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ward_logs_recorded_via_check'
  ) THEN
    ALTER TABLE ward_logs ADD CONSTRAINT ward_logs_recorded_via_check
      CHECK (recorded_via IS NULL OR recorded_via IN ('student', 'teacher', 'queue'));
  END IF;
END $$;

-- حارس التكرار اليومي (FR-005) يبحث بـ (teacher_id, student_id, date)؛ فهرس (teacher_id, date) قائم لكنه لا يغطي الطالب.
CREATE INDEX IF NOT EXISTS idx_ward_logs_halaqah_student_date
  ON ward_logs (teacher_id, student_id, date);
```

**كيف تبقى البيانات القديمة صالحة**
- الأعمدة الجديدة كلها nullable؛ لا `DEFAULT` يعيد كتابة صفوف قائمة؛ لا `UPDATE` لصفوف قديمة.
- `stage IS NULL` ⇒ `profileFor(null)` يرجع ملف `legacy` المطابق للسلوك الحالي حرفياً.
- `recorded_via IS NULL` ⇒ تُقرأ كـ`'student'` في الكود (`recordedVia ?? "student"`).
- لا تغيير في أعمدة `/api/v1` ولا حمولات webhooks (الحقول الجديدة لا تدخل الحمولة).

## 3. المايقريشن M2 — `20261116000000_points_rewards` (مقترحة — NOT applied, needs approval)

```sql
-- دفتر النقاط (append-only بالتصميم: لا مسار UPDATE/DELETE في الكود) + الجوائز + طلبات الاستبدال.
-- المفتاح (halaqah_id, student_id) = students(teacher_id, id) على نمط attendance.

CREATE TABLE IF NOT EXISTS rewards (
  id          SERIAL PRIMARY KEY,
  halaqah_id  INTEGER REFERENCES halaqahs(id) ON DELETE CASCADE,
  mosque_id   INTEGER REFERENCES mosques(id)  ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  cost_points INTEGER     NOT NULL CHECK (cost_points BETWEEN 1 AND 100000),
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((halaqah_id IS NOT NULL) <> (mosque_id IS NOT NULL))   -- جائزة حلقة أو جائزة جامع، لا الاثنتان
);
CREATE INDEX IF NOT EXISTS idx_rewards_halaqah ON rewards (halaqah_id) WHERE halaqah_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rewards_mosque  ON rewards (mosque_id)  WHERE mosque_id  IS NOT NULL;

CREATE TABLE IF NOT EXISTS reward_redemptions (
  id            SERIAL PRIMARY KEY,
  halaqah_id    INTEGER NOT NULL,
  student_id    TEXT    NOT NULL,
  reward_id     INTEGER NOT NULL REFERENCES rewards(id),
  reward_name   TEXT    NOT NULL,             -- لقطة وقت الطلب (تغيير اسم/سعر الجائزة لا يغيّر الطلب)
  cost_points   INTEGER NOT NULL CHECK (cost_points > 0),
  status        TEXT    NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'delivered', 'cancelled')),
  requested_by  TEXT    NOT NULL CHECK (requested_by IN ('student', 'parent', 'teacher')),
  requested_by_teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  requested_by_parent_id  INTEGER REFERENCES parents(id) ON DELETE SET NULL,
  resolved_by_teacher_id  INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ,
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_redemptions_halaqah_status ON reward_redemptions (halaqah_id, status);
CREATE INDEX IF NOT EXISTS idx_redemptions_student ON reward_redemptions (halaqah_id, student_id);

CREATE TABLE IF NOT EXISTS points_ledger (
  id            BIGSERIAL PRIMARY KEY,
  halaqah_id    INTEGER NOT NULL,
  student_id    TEXT    NOT NULL,
  kind          TEXT    NOT NULL CHECK (kind IN ('award', 'mastery_bonus', 'redeem', 'refund')),
  points        INTEGER NOT NULL CHECK (points <> 0),
  ward_log_id   INTEGER REFERENCES ward_logs(id) ON DELETE SET NULL,
  redemption_id INTEGER REFERENCES reward_redemptions(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (halaqah_id, student_id) REFERENCES students(teacher_id, id) ON DELETE CASCADE,
  -- الإشارة تطابق النوع: اكتساب موجب، استبدال سالب، استرجاع موجب
  CHECK ((kind IN ('award', 'mastery_bonus', 'refund') AND points > 0) OR (kind = 'redeem' AND points < 0))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_ward_kind ON points_ledger (ward_log_id, kind) WHERE ward_log_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_redemption_kind ON points_ledger (redemption_id, kind) WHERE redemption_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_points_student ON points_ledger (halaqah_id, student_id);
```

**ملاحظات تصميم**
- `ward_log_id`/`redemption_id` يحملان `ON DELETE SET NULL`: حذف ورد (للطالب قبل الاعتماد فقط) لا يمسح النقاط التاريخية. ارتباط النوع بالمعرّف
  (award/mastery_bonus ⇒ ward_log_id، redeem/refund ⇒ redemption_id) يُفرض بالكود وبفهرسَي UNIQUE الجزئيين لا بـCHECK (حتى لا يتعارض مع SET NULL).
- لا `UPDATE`/`DELETE` على `points_ledger` في الكود إطلاقاً (FR-015). التدقيق: اختبار lint بسيط يبحث عن `UPDATE points_ledger|DELETE FROM points_ledger` في `web/lib` ويفشل.
  الحذف التتابعي عند حذف الطالب نفسه (`ON DELETE CASCADE`) مقبول لأنه حذف بيانات شخصية (PDPL).
- الرصيد **ليس عموداً**: `SELECT COALESCE(SUM(points),0) FROM points_ledger WHERE halaqah_id=$1 AND student_id=$2` (SC-004).
- جائزة الجامع (`mosque_id`) تظهر لكل حلقات الجامع؛ جائزة الحلقة لحلقتها فقط.

## 4. الكيانات (حقول)

| الكيان | الحقول الأساسية | ملاحظات |
|---|---|---|
| Halaqah (موسَّع) | `stage` | NULL = legacy |
| WardLog (موسَّع) | `recordedByTeacherId`, `recordedVia` (`student`/`teacher`/`queue`) | التقارير لا تتغير (تقرأ المعتمد فقط) |
| PointsLedgerEntry | `id, halaqahId, studentId, kind, points, wardLogId?, redemptionId?, createdAt` | غير قابل للتعديل |
| Reward | `id, halaqahId?|mosqueId?, name, costPoints, active` | |
| Redemption | `id, halaqahId, studentId, rewardId, rewardName, costPoints, status, requestedBy, createdAt, resolvedAt?` | لقطة الاسم والسعر |

## 5. آلات الحالة

### حالة الورد (WardStatus) — بعد 001

```text
          ┌─────────────── (معلّم ابتدائي) ──────────────┐
          │                                              ▼
 [إنشاء طالب] new ──seen──► seen ──approved──► approved ──(reopen: teacher/queue فقط)──► needs_revision
                │                                   ▲                                          │
                └────────approved──────────────────┘                                          └─ الطالب يعيد الإرسال (محاولة جديدة)
 [إنشاء معلّم/طابور] ────────────────────────────► approved
```

- `new|seen → approved` كما اليوم (`setWardLogStatus`).
- `approved → needs_revision`: **جديد** عبر `reopenApprovedWard`، فقط حين `recorded_via ∈ {teacher, queue}` وبملاحظة إلزامية وإخطار الطالب/ولي الأمر (FR-009).
  أوراد `student` المعتمدة تبقى نهائية.
- إعادة الإرسال بعد `needs_revision` تنشئ محاولة جديدة بـ`previous_attempt_id` كما هو الآن؛ في حالة ورد أنشأه المعلّم/الطابور تُنشأ المحاولة الجديدة بيد المعلّم (`recorded_via='teacher'`) أو الطالب بنفسه إن كان له حساب.

### حالة طلب الاستبدال

```text
 (طلب) ──► requested ──deliver──► delivered   (نهائي)
               │
               └──cancel──► cancelled         (نهائي؛ يُسجَّل refund في الدفتر)
```

- `requested` يُنشأ مع حركة `redeem` سالبة في **المعاملة نفسها** (خصم عند الطلب).
- `cancelled` يُنشئ حركة `refund` موجبة بنفس القيمة (مرة واحدة بفضل `uq_points_redemption_kind`).
- الإلغاء والتسليم للمعلّم (أو مدير الجامع) فقط؛ الطالب/ولي الأمر يطلبون فقط. لا انتقال من `delivered`/`cancelled`.

## 6. قواعد النقاط

- `award`: عند أول انتقال الورد إلى `approved` **وفي حلقة مفعّلة لها النقاط** (`stages` يحتوي فئة الحلقة وميزة `stage_points` مفعّلة): `perApproved`.
- `mastery_bonus`: `masteryBonus` إضافية عند: (أ) ورد قُيِّم بنقاط الأخطاء ودرجته ≥ `masteryMinScore`، أو (ب) إتقان من المحاولة الأولى في الطابور (002)، أو (ج) المعلّم ضغط «متقن» عند تسجيله عن الطالب.
- idempotent: إعادة اعتماد/إعادة استدعاء لا تكرّر (UNIQUE).
- عند `reopen` لا تُسترجع النقاط تلقائياً (قرار مفتوح Q6).
