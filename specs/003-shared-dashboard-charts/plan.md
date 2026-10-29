# خطة التنفيذ: رسوم بيانية موحّدة لكل اللوحات

**الفرع**: `003-shared-dashboard-charts` | **المواصفة**: [spec.md](./spec.md)

## الملخّص

ننقل مكوّنات SVG الحالية من `components/students-dashboard/` إلى مكتبة مشتركة `components/charts/`، ونضيف `AreaChart` و`HBarChart`، ودوال تجميع نقية في `lib/chart-series.ts`، ثم نوسّع ثلاث نقاط API قائمة (دون نقاط جديدة قدر الإمكان) ونركّب الرسوم في أربع لوحات.

## السياق التقني

- Next.js 16 (اقرأ `web/AGENTS.md`)، Postgres عبر `@netlify/database`، Tailwind برموز الهوية.
- لا مكتبات جديدة. لا مايقريشن. قراءة فقط.
- التوقيت: Asia/Riyadh في حساب الأيام (`date` في `ward_logs` نصّ/تاريخ محلي — راجع الاستعلامات القائمة واتّبعها).

## فحص الدستور

| المبدأ | الحالة |
|---|---|
| I. لا تسليع | ✅ لا شيء تجاري |
| II. الخصوصية | ✅ لوحتا المطوّر والجمعية مجمّعة فقط؛ كل نقطة خلف صلاحية نطاقها |
| III. قاعدة إضافية فقط | ✅ لا تغيير على القاعدة |
| IV. الاختبار والبوابات | ✅ دوال نقية مع اختبارات أولاً + البوابات الأربع |
| V. هوية واحدة | ✅ `TONES` ورموز الهوية فقط، داكن وفاتح، 375px |
| VI. طويل المدى | ✅ مكتبة مشتركة تخدم لوحات المستقبل |
| VII. البساطة | ✅ رسم واحد = فكرة واحدة |

## البنية

```text
web/components/charts/
  index.ts          # تصدير موحّد
  panel.tsx         # منقول: Panel, PanelEmpty, Dot, TONES, softCardClass
  bar-chart.tsx     # منقول
  donut.tsx         # منقول
  area-chart.tsx    # جديد: سلسلة يومية
  hbar-chart.tsx    # جديد: أعمدة أفقية لتسميات طويلة
web/components/students-dashboard/{panel,bar-chart,donut}.tsx  # إعادة تصدير فقط
web/lib/chart-series.ts (+ .test.ts)
  fillDailySeries(rows, from, to) → يملأ الأيام الخالية بـ 0
  weeklyBuckets(rows, weeks, today)
  topNWithOther(items, n, otherLabel)
  safePct(part, total) → 0 عند total=0
web/lib/dashboard-charts-db.ts   # استعلامات التجميع (SQL مُعلّم بالمعاملات)
```

## نقاط API

| النقطة | التغيير | الصلاحية |
|---|---|---|
| `GET /api/dev/overview` | حقل جديد `charts: { wardsDaily, newStudentsWeekly, topMosques, registrations }` | جلسة المطوّر (كما هي) |
| `GET /api/mosques/[id]/stats` | حقل جديد `charts: { wardsDaily, studentsPerHalaqah, attendancePerHalaqah, mastery }` | فحص مدير الجامع/الجمعية الحالي |
| `GET /api/association/dashboard` | حقل جديد `charts: { wardsDaily, mosqueComparison }` ضمن from/to | جلسة الجمعية (كما هي) |
| `GET /api/association/mosques/[mosqueId]` أو ما يغذّي صفحتها | نفس `charts` الخاصة بالجامع | جلسة الجمعية + ربط الجامع |
| المعلّم | `wardsDaily` لحلقته — يوسّع ما تقرأه صفحة الطلاب | `currentTeacher` |

الحقول الجديدة **إضافية**: لا يُحذف ولا يُعاد تسمية أي حقل قائم (الواجهات الحالية تبقى تعمل).

## المخاطر

- **صفحة المعلّم تعتمد على M1**: لا تمسّ `app/(teacher)/layout.tsx`.
- **حجم صفحة مدير الجامع (675 سطراً)**: أضف الرسوم كمكوّن منفصل `components/mosque/mosque-charts.tsx` بدل التضخيم.
- **الأداء**: كل استعلام بفهرس قائم (`ward_logs` على `(teacher_id, date)`)؛ نافذة 30 يوماً فقط.
