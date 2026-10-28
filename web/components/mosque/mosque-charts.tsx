"use client";

import { AreaChart, Donut, HBarChart, Panel, TONES, type Tone } from "@/components/charts";
import { safePct } from "@/lib/chart-series";
import type { MosqueCharts } from "@/lib/dashboard-charts-db";
import type { MasteryBucketKey } from "@/lib/students-stats";

/*
  مواصفة 003 — رسوم لوحة الجامع (القصة 3): أوراد يومية، طلاب لكل حلقة،
  نسبة حضور لكل حلقة، وتوزيع الإتقان. تُغذّى من /api/mosques/[id]/stats
  أو من مسار الجمعية لجامع مرتبط بها (نفس الشكل) — مكوّن واحد لمصدري البيانات.
*/

// نفس ألوان فئات الإتقان بصفحة المعلّم (students-dashboard/panels) لهوية واحدة
const MASTERY_TONES: Record<MasteryBucketKey, Tone> = {
  excellent: TONES.success,
  veryGood: TONES.accent100,
  good: TONES.accent70,
  needsFollowUp: TONES.destructive,
};

export function MosqueChartsSection({ charts }: { charts: MosqueCharts }) {
  const wardsTotal = charts.wardsDaily.reduce((sum, p) => sum + p.value, 0);
  const studentsTotal = charts.studentsPerHalaqah.reduce((sum, b) => sum + b.value, 0);

  return (
    <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
      <Panel title="الأوراد اليومية (٣٠ يوماً)">
        <AreaChart
          points={charts.wardsDaily}
          ariaLabel={`أوراد الجامع يومياً خلال آخر ٣٠ يوماً، الإجمالي ${wardsTotal} ورداً`}
        />
      </Panel>

      <Panel title="الطلاب في كل حلقة">
        <HBarChart
          ariaLabel={`عدد الطلاب في كل حلقة: ${charts.studentsPerHalaqah.map((h) => `${h.label} ${h.value}`).join("، ")}، الإجمالي ${studentsTotal}`}
          bars={charts.studentsPerHalaqah.map((h) => ({ label: h.label, value: h.value, tone: TONES.accent100 }))}
        />
      </Panel>

      <Panel title="نسبة الحضور لكل حلقة (٣٠ يوماً)">
        <HBarChart
          ariaLabel={`نسبة الحضور لكل حلقة خلال آخر ٣٠ يوماً: ${charts.attendancePerHalaqah.map((h) => `${h.label} ${h.value}٪`).join("، ")}`}
          bars={charts.attendancePerHalaqah.map((h) => ({
            label: h.label,
            value: h.value,
            tone: h.value >= 75 ? TONES.success : TONES.accent70,
            pct: true,
          }))}
        />
      </Panel>

      <Panel title="توزيع الإتقان">
        <Donut
          total={charts.mastery.total}
          centerLabel="طالب"
          ariaLabel={`توزيع الإتقان على مستوى الجامع: ${charts.mastery.buckets.map((b) => `${b.label} ${b.count}`).join("، ")}`}
          slices={charts.mastery.buckets.map((b) => ({
            label: b.label,
            value: b.count,
            pct: safePct(b.count, charts.mastery.total),
            tone: MASTERY_TONES[b.key],
          }))}
        />
      </Panel>
    </div>
  );
}
