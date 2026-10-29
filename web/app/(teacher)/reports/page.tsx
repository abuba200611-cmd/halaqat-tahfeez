"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty } from "@/components/ui";
import { BarChart, HBarChart, Panel, TONES } from "@/components/charts";
import { MONTH_NAMES } from "@/lib/schedule";
import { monthlyBars } from "@/lib/monthly-report";

type MonthlyReport = {
  key: string;
  hifzPages: number;
  reviewPages: number;
  activeStudents: number;
  avgScore?: number | null;
};

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/*
  أداء الحلقة الشهري — رسوم من أرقام التقرير نفسها (مواصفة 003): الحفظ
  أولاً بعرض كامل ثم المراجعة والنشطون جنباً إلى جنب، ومتوسط الدرجة إن
  وُجد تقييم نقاط الأخطاء. بلا بطاقات أرقام.
*/

export default function ReportsPage() {
  const [months, setMonths] = useState<MonthlyReport[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/reports/monthly");
      if (res.ok) {
        const data = (await res.json()) as { months?: MonthlyReport[] };
        setMonths(data.months ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">أداء الحلقة الشهري</h1>
        <p className="text-sm text-muted-foreground">
          مجموع صفحات الحفظ والمراجعة كل شهر، من كل الطلاب المرتبطين + وارد النظام الداخلي.
        </p>
      </div>

      {loading || !months ? (
        <Empty title="جارٍ التحميل…" />
      ) : months.length === 0 ? (
        <Empty title="ما فيه ورد مسجّل بعد لعرض تقرير شهري. اربط طلابك بتسجيل الطلاب أولاً." />
      ) : (
        <ReportsCharts months={months} />
      )}
    </div>
  );
}

function ReportsCharts({ months }: { months: MonthlyReport[] }) {
  const hifz = monthlyBars(months, (m) => m.hifzPages);
  const review = monthlyBars(months, (m) => m.reviewPages);
  const active = monthlyBars(months, (m) => m.activeStudents);
  const scored = months.filter((m) => m.avgScore != null);
  const scoreBars = monthlyBars(scored, (m) => Math.round(m.avgScore ?? 0));

  const hifzTotal = hifz.reduce((sum, b) => sum + b.value, 0);
  const reviewTotal = review.reduce((sum, b) => sum + b.value, 0);
  const range =
    months.length > 0
      ? `${monthLabel(months[months.length - 1].key)} — ${monthLabel(months[0].key)}`
      : "";

  return (
    <div className="space-y-4">
      <Panel title={`صفحات الحفظ شهرياً${range ? ` (${range})` : ""}`}>
        <BarChart
          ariaLabel={`صفحات الحفظ شهرياً، الإجمالي ${hifzTotal} صفحة`}
          bars={hifz.map((b) => ({ label: b.label, value: b.value, tone: TONES.accent100 }))}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="صفحات المراجعة شهرياً">
          <BarChart
            ariaLabel={`صفحات المراجعة شهرياً، الإجمالي ${reviewTotal} صفحة`}
            bars={review.map((b) => ({ label: b.label, value: b.value, tone: TONES.accent70 }))}
          />
        </Panel>

        <Panel title="الطلاب النشطون شهرياً">
          <BarChart
            ariaLabel={`الطلاب النشطون شهرياً: ${active.map((b) => `${b.label} ${b.value}`).join("، ")}`}
            bars={active.map((b) => ({ label: b.label, value: b.value, tone: TONES.success }))}
          />
        </Panel>

        {scoreBars.length > 0 && (
          <Panel title="متوسط الدرجة شهرياً (تقييم نقاط الأخطاء)">
            <HBarChart
              ariaLabel={`متوسط درجة التسميع شهرياً: ${scoreBars.map((b) => `${b.label} ${b.value}`).join("، ")}`}
              bars={scoreBars.map((b) => ({ label: b.label, value: b.value, tone: TONES.accent100 }))}
            />
          </Panel>
        )}
      </div>
    </div>
  );
}
