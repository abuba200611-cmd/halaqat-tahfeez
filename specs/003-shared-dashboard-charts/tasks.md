# المهام: رسوم بيانية موحّدة لكل اللوحات

**المدخلات**: [spec.md](./spec.md)، [plan.md](./plan.md)
**القاعدة**: الدوال النقية واختباراتها أولاً. `[P]` = يمكن تنفيذه بالتوازي (ملفات مختلفة).

## المرحلة 1: المكتبة المشتركة (القصة 1 — P1)

- [x] T001 أنشئ `web/components/charts/` وانقل إليه `panel.tsx` و`bar-chart.tsx` و`donut.tsx` من `components/students-dashboard/` كما هي، وأضف `index.ts`.
- [x] T002 اجعل ملفات `components/students-dashboard/{panel,bar-chart,donut}.tsx` إعادة تصدير فقط من `components/charts` (لا تعديل على `panels.tsx` ولا صفحة الطلاب).
- [x] T003 [P] اختبارات `web/lib/chart-series.test.ts` أولاً: `fillDailySeries` (أيام خالية، حدود الفترة، توقيت الرياض)، `weeklyBuckets`، `topNWithOther` (أقل/أكثر من N)، `safePct` (قسمة على صفر).
- [x] T004 نفّذ `web/lib/chart-series.ts` حتى تنجح T003.
- [x] T005 [P] `components/charts/area-chart.tsx`: سلسلة يومية SVG، شبكة خفيفة مثل `BarChart`، تسميات المحور كل ~7 أيام، `PanelEmpty` عند الأصفار، `aria-label`.
- [x] T006 [P] `components/charts/hbar-chart.tsx`: أعمدة أفقية RTL، اختصار التسمية الطويلة بـ «…» مع `title` كامل، قيمة بجانب كل عمود، يدعم النسبة (`%`).

**نقطة تحقق**: صفحة الطلاب عند المعلّم مطابقة بصرياً (لقطات قبل/بعد).

## المرحلة 2: لوحة المطوّر (القصة 2 — P1)

- [x] T007 `web/lib/dashboard-charts-db.ts`: `devCharts()` — أوراد يومية 30 يوماً، طلاب جدد أسبوعياً 12 أسبوعاً، أفضل 10 جوامع بالطلاب الفعّالين، حالات التسجيلات. أرقام مجمّعة فقط.
- [x] T008 أضف `charts` إلى `GET /api/dev/overview` (إضافي) + حدّث اختبار المسار إن وجد.
- [x] T009 ركّب الرسوم الأربعة في `app/(dev)/dev/page.tsx` تحت بطاقات الأرقام بشبكة `lg:grid-cols-2`.

## المرحلة 3: لوحة مدير الجامع (القصة 3 — P1)

- [x] T010 `mosqueCharts(mosqueId)` في `dashboard-charts-db.ts`: أوراد يومية، طلاب لكل حلقة، نسبة حضور لكل حلقة 30 يوماً (`safePct`)، توزيع الإتقان (أعد استعمال `masteryDistribution` من `lib/students-stats.ts`).
- [x] T011 أضف `charts` إلى `GET /api/mosques/[id]/stats` (إضافي، نفس فحص الصلاحية).
- [x] T012 مكوّن `components/mosque/mosque-charts.tsx` يعرض الرسوم الأربعة، ويُركَّب في `app/(mosque)/mosque/[id]/page.tsx` قرب قسم الإحصاءات الحالي.

## المرحلة 4: لوحة الجمعية (القصة 4 — P2)

- [x] T013 `associationCharts(associationId, from, to)`: أوراد يومية لكل الجوامع المرتبطة ضمن الفترة، ومقارنة الجوامع (طلاب فعّالون، نسبة حضور) عبر `topNWithOther`.
- [x] T014 أضف `charts` إلى `GET /api/association/dashboard` (إضافي، يحترم from/to).
- [x] T015 ركّب الرسوم في `app/(association)/association/page.tsx`.
- [x] T016 صفحة `association/mosques/[mosqueId]`: أعد استعمال `mosque-charts.tsx` بمصدر بيانات الجمعية (تحقّق من ربط الجامع بالجمعية قبل الإرجاع).

## المرحلة 5: المعلّم (القصة 5 — P3)

- [x] T017 أضف `wardsDaily` لحلقة المعلّم إلى ما تقرأه صفحة الطلاب، واعرض `AreaChart` فوق اللوحات الحالية. لا تمسّ `app/(teacher)/layout.tsx`.

## المرحلة 6: الصقل

- [x] T018 لقطات 1440 و375، داكن وفاتح، للوحات الأربع (`scratchpad/shot-page.mjs` مع بيانات API وهمية)؛ لا تمرير أفقي، تباين سليم.
- [x] T019 البوابات من `web/`: `npx tsc --noEmit`، `npx eslint .` (0 أخطاء)، `npx vitest run`، `npm run build`.

## الاعتماديات

المرحلة 1 قبل كل شيء. المراحل 2–5 مستقلة عن بعضها بعد المرحلة 1. لا شيء يعتمد على M1/M3.
