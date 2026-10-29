"use client";

import { Card } from "@/components/ui";
import { useApi } from "@/components/mosque/use-api";
import { AreaChart, BarChart, Donut, HBarChart, Panel, TONES } from "@/components/charts";
import { safePct, type CategoryPoint, type DailyPoint } from "@/lib/chart-series";

type Overview = {
  counts: {
    mosques: number;
    halaqahs: number;
    teachersActive: number;
    studentsActive: number;
    parents: number;
    registrationsPending: number;
    wardsLast7Days: number;
  };
  dbName: string;
  dbSize: string;
  deploy: { commitSha: string | null; commitMessage: string | null };
  charts?: {
    wardsDaily: DailyPoint[];
    newStudentsWeekly: CategoryPoint[];
    topMosques: CategoryPoint[];
    registrations: CategoryPoint[];
  };
};

export default function DevOverviewPage() {
  const { data, loading, status } = useApi<Overview>("/api/dev/overview");

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>;
  if (!data) {
    return (
      <Card className="p-4 text-sm text-destructive">
        {status === 401 ? "الجلسة انتهت — سجّل الدخول من جديد." : "تعذّر التحميل."}
      </Card>
    );
  }

  const stats: [string, number | string][] = [
    ["الجوامع", data.counts.mosques],
    ["الحلقات", data.counts.halaqahs],
    ["المعلّمون الفعّالون", data.counts.teachersActive],
    ["الطلاب الفعّالون", data.counts.studentsActive],
    ["أولياء الأمور", data.counts.parents],
    ["تسجيلات بانتظار التوزيع", data.counts.registrationsPending],
    ["أوراد آخر ٧ أيام", data.counts.wardsLast7Days],
    ["حجم القاعدة", data.dbSize],
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">نظرة عامة</h1>
        <p className="text-sm text-muted-foreground">أرقام المنصة الآن — قاعدة البيانات {data.dbName}</p>
      </div>

      {/* الرسوم أولاً ثم الأرقام — طلب المالك: الأرقام تنزل تحت كل الرسوم */}
      {data.charts && <DevChartsSection charts={data.charts} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <Card key={label} className="px-4 py-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="tabular mt-1 text-2xl font-bold">{value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">آخر نشر</h2>
        {data.deploy.commitSha ? (
          <p className="text-sm text-muted-foreground" dir="ltr">
            <span className="font-mono">{data.deploy.commitSha.slice(0, 10)}</span>
            {data.deploy.commitMessage ? ` — ${data.deploy.commitMessage}` : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">لا يوجد معلومات نشر بهذه البيئة (ليست Vercel أو بلا متغيراتها).</p>
        )}
      </Card>
    </div>
  );
}

/** ألوان حالات التسجيلات بالترتيب الذي ترجعه الخدمة: بانتظار/موزَّعة/انتظار القائمة */
const REGISTRATION_TONES = [TONES.accent70, TONES.success, TONES.accent45, TONES.accent25];

/** رسوم اتجاه المنصة (مواصفة 003) — أرقام مجمّعة فقط، لا أسماء أشخاص */
function DevChartsSection({
  charts,
}: {
  charts: NonNullable<Overview["charts"]>;
}) {
  const wardsTotal = charts.wardsDaily.reduce((sum, p) => sum + p.value, 0);
  const newStudentsTotal = charts.newStudentsWeekly.reduce((sum, b) => sum + b.value, 0);
  const registrationsTotal = charts.registrations.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
      <Panel title="الأوراد اليومية (٣٠ يوماً)">
        <AreaChart
          points={charts.wardsDaily}
          ariaLabel={`أوراد المنصة يومياً خلال آخر ٣٠ يوماً، الإجمالي ${wardsTotal} ورداً`}
        />
      </Panel>

      <Panel title="طلاب جدد أسبوعياً (١٢ أسبوعاً)">
        <BarChart
          ariaLabel={`الطلاب الجدد أسبوعياً خلال آخر ١٢ أسبوعاً، الإجمالي ${newStudentsTotal} طالباً`}
          bars={charts.newStudentsWeekly.map((b) => ({ label: b.label, value: b.value, tone: TONES.accent100 }))}
        />
      </Panel>

      <Panel title="أكثر الجوامع طلاباً فعّالين">
        <HBarChart
          ariaLabel={`مقارنة الجوامع بالطلاب الفعّالين: ${charts.topMosques.map((m) => `${m.label} ${m.value}`).join("، ")}`}
          bars={charts.topMosques.map((m) => ({ label: m.label, value: m.value, tone: TONES.accent70 }))}
        />
      </Panel>

      <Panel title="حالات التسجيلات">
        <Donut
          total={registrationsTotal}
          centerLabel="تسجيل"
          ariaLabel={`حالات التسجيلات: ${charts.registrations.map((r) => `${r.label} ${r.value}`).join("، ")}`}
          slices={charts.registrations.map((r, i) => ({
            label: r.label,
            value: r.value,
            pct: safePct(r.value, registrationsTotal),
            tone: REGISTRATION_TONES[i] ?? TONES.accent25,
          }))}
        />
      </Panel>
    </div>
  );
}
