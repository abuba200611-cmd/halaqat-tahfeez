"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Card, Empty } from "@/components/mosque/ui";
import { useApi } from "@/components/mosque/use-api";
import { inputClass } from "@/components/mosque/mosque-page";
import { AssociationPage } from "@/components/association/association-page";
import { AssociationLinkPanel } from "@/components/association/link-panel";
import { AreaChart, Donut, HBarChart, Panel, TONES } from "@/components/charts";
import { safePct } from "@/lib/chart-series";
import type { AssociationCharts } from "@/lib/dashboard-charts-db";
import type { AssociationTotals, MosqueKpiRow } from "@/lib/association";

/*
  A3 — لوحة الجمعية (قراءة فقط): رسوم مقارنة الجوامع واتجاهاتها، قائمة
  الجوامع، تقرير مجمّع بصيغة CSV، وفتح كل جامع بعرض قراءة فقط. الفترة
  تؤثر في الحضور والاختبارات؛ التصاريح حالتها الراهنة لعام كل جامع
  الدراسي. رسوم الاتجاه (مواصفة 003) ضمن فترة الفلتر نفسها.
*/

type DashboardData = {
  association: { id: number; name: string; city: string } | null;
  period: { from: string; to: string };
  mosques: MosqueKpiRow[];
  totals: AssociationTotals;
  charts?: AssociationCharts;
};

function pct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export default function AssociationDashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const custom = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const query = custom ? `?from=${from}&to=${to}` : "";
  const { data, status, loading } = useApi<DashboardData>(`/api/association/dashboard${query}`);

  return (
    <AssociationPage title="لوحة الجمعية" activeHref="/association">
      <div className="space-y-5">
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">من</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">إلى</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </label>
          <p className="tabular text-xs text-muted-foreground">
            {data ? `الفترة: ${data.period.from} → ${data.period.to}` : "الافتراضي: الشهر الهجري الجاري"}
          </p>
          {data && (
            <a
              href={`/api/association/report?format=csv&from=${data.period.from}&to=${data.period.to}`}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              تصدير CSV
            </a>
          )}
        </Card>

        {loading && !data && <Empty title="جارٍ التحميل…" />}
        {!loading && !data && <Empty title={status === 400 ? "فترة غير صالحة." : "تعذّر تحميل البيانات."} />}

        {data && (
          <>
            {data.charts && <AssociationChartsSection charts={data.charts} totals={data.totals} period={data.period} />}

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold">الجوامع</h2>
              {data.mosques.length === 0 ? (
                <Empty
                  title="لا جوامع مرتبطة بجمعيتك بعد — أرسل طلب «ربط جامع» من الأسفل."
                  action={
                    <Link href="/association/help" className="text-sm text-accent-ink underline">
                      كيف أستخدم المنصة؟
                    </Link>
                  }
                />
              ) : (
                data.mosques.map((m) => (
                  <Card key={m.mosqueId} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{m.name}</p>
                        {m.city && <p className="text-xs text-muted-foreground">{m.city}</p>}
                      </div>
                      <Link
                        href={`/association/mosques/${m.mosqueId}`}
                        className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                      >
                        عرض (قراءة فقط)
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge>{m.halaqat} حلقة</Badge>
                      <Badge>{m.activeStudents} طالباً</Badge>
                      <Badge tone="good">حضور {pct(m.attendanceRate)}</Badge>
                      <Badge>
                        اختبارات {m.examResults} (ناجح {m.examPassed})
                      </Badge>
                      {m.permits ? (
                        <Badge tone={m.permits.suspended + m.permits.pendingRenewal > 0 ? "warn" : "good"}>
                          تصاريح: {m.permits.active} فعّال · {m.permits.suspended} موقوف · {m.permits.pendingRenewal} للتجديد ·{" "}
                          {m.permits.withdrawn} مسحوب
                        </Badge>
                      ) : (
                        <Badge>التصاريح غير مفعّلة</Badge>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </section>
          </>
        )}

        <AssociationLinkPanel />
      </div>
    </AssociationPage>
  );
}

/*
  رسوم لوحة الجمعية (مواصفة 003) — الأوراد بعرض كامل أولاً ثم مقارنتا
  الجوامع وحالتا التصاريح والاختبارات جانباً إلى جانب، كلها من أرقام
  التقرير نفسها بلا أي طلب إضافي.
*/
function AssociationChartsSection({
  charts,
  totals,
  period,
}: {
  charts: AssociationCharts;
  totals: AssociationTotals;
  period: { from: string; to: string };
}) {
  const wardsTotal = charts.wardsDaily.reduce((sum, p) => sum + p.value, 0);
  const permitsTotal = totals.permits.active + totals.permits.suspended + totals.permits.withdrawn + totals.permits.pendingRenewal;
  const examFailed = Math.max(totals.examResults - totals.examPassed, 0);

  return (
    <div className="space-y-3 sm:space-y-4">
      <Panel title="أوراد الجوامع يومياً (خلال الفترة)">
        <AreaChart
          points={charts.wardsDaily}
          ariaLabel={`أوراد جوامع الجمعية يومياً من ${period.from} إلى ${period.to}، الإجمالي ${wardsTotal} ورداً`}
        />
      </Panel>

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <Panel title="مقارنة الجوامع: الطلاب الفعّالون">
          <HBarChart
            ariaLabel={`الطلاب الفعّالون بكل جامع: ${charts.mosqueComparison.activeStudents.map((m) => `${m.label} ${m.value}`).join("، ")}`}
            bars={charts.mosqueComparison.activeStudents.map((m) => ({
              label: m.label,
              value: m.value,
              tone: TONES.accent100,
            }))}
          />
        </Panel>

        <Panel title="مقارنة الجوامع: نسبة الحضور (خلال الفترة)">
          <HBarChart
            ariaLabel={`نسبة الحضور بكل جامع خلال الفترة: ${charts.mosqueComparison.attendanceRate.map((m) => `${m.label} ${m.value}٪`).join("، ")}`}
            bars={charts.mosqueComparison.attendanceRate.map((m) => ({
              label: m.label,
              value: m.value,
              tone: m.value >= 75 ? TONES.success : TONES.accent70,
              pct: true,
            }))}
          />
        </Panel>

        <Panel title="حالات التصاريح (عام كل جامع الدراسي)">
          <Donut
            total={permitsTotal}
            centerLabel="تصريح"
            ariaLabel={`حالات التصاريح: فعّال ${totals.permits.active}، موقوف ${totals.permits.suspended}، بانتظار التجديد ${totals.permits.pendingRenewal}، مسحوب ${totals.permits.withdrawn}`}
            slices={[
              { label: "فعّال", value: totals.permits.active, pct: safePct(totals.permits.active, permitsTotal), tone: TONES.success },
              { label: "موقوف", value: totals.permits.suspended, pct: safePct(totals.permits.suspended, permitsTotal), tone: TONES.destructive },
              { label: "بانتظار التجديد", value: totals.permits.pendingRenewal, pct: safePct(totals.permits.pendingRenewal, permitsTotal), tone: TONES.accent100 },
              { label: "مسحوب", value: totals.permits.withdrawn, pct: safePct(totals.permits.withdrawn, permitsTotal), tone: TONES.accent25 },
            ]}
          />
        </Panel>

        <Panel title="نتائج الاختبارات (خلال الفترة)">
          <Donut
            total={totals.examResults}
            centerLabel="نتيجة"
            ariaLabel={`نتائج الاختبارات خلال الفترة: ناجح ${totals.examPassed}، غير ناجح ${examFailed}`}
            slices={[
              { label: "ناجح", value: totals.examPassed, pct: safePct(totals.examPassed, totals.examResults), tone: TONES.success },
              { label: "غير ناجح", value: examFailed, pct: safePct(examFailed, totals.examResults), tone: TONES.accent45 },
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}
