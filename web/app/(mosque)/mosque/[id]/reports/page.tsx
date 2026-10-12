"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty, Stat } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { useApi } from "@/components/mosque/use-api";
import { PERIOD_CHOICES, periodLabel, type PeriodChoice } from "@/lib/mosque/report-periods";

type TopRow = { name: string; total: number; maxTotal: number; percent: number };
type HalaqahMetricsSummary = {
  attendanceRate: number | null;
  wardsSubmitted: number;
  wardsApproved: number;
  planOnTrackRatio: number | null;
  recitationsCount: number;
  recitationsAvgScore: number | null;
};
type ReportData = {
  mosque: { name: string; city: string };
  period: { from: string; to: string };
  enabled: {
    halaqat: boolean;
    registration: boolean;
    families: boolean;
    committees: boolean;
    weekly_evaluation: boolean;
    badges: boolean;
  };
  kpis: {
    halaqatCount: number;
    activeStudents: number;
    unreachableHalaqat: number;
    pendingRegistrations: number;
    familiesCount: number;
    committeesCount: number;
    openTasks: number;
    evaluationsAvgPercent: number | null;
    badgesAwarded: number;
    activities: number | null;
  };
  topFamilies: TopRow[];
  topStudents: TopRow[];
  badges: { icon: string; name: string; count: number }[];
  halaqat: {
    name: string;
    teacher: string;
    activeStudents: number | null;
    avgMastery: number | null;
    totalPages: number | null;
    metrics: HalaqahMetricsSummary | null;
  }[];
};

/** تقرير الفترة المختارة — مؤشرات وترتيب وحلقات، مع طباعة وتصدير CSV */
export default function ReportsPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/reports`} title="التقارير">
      <ReportsSection mosqueId={mosqueId} />
    </MosquePage>
  );
}

function ReportsSection({ mosqueId }: { mosqueId: number }) {
  const [choice, setChoice] = useState<PeriodChoice>("this_week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const url =
    choice === "custom"
      ? from && to
        ? `/api/mosques/${mosqueId}/reports?period=custom&from=${from}&to=${to}`
        : null
      : `/api/mosques/${mosqueId}/reports?period=${choice}`;
  const { data, status, loading } = useApi<ReportData>(url);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-3 p-4 print:hidden">
        <label className="block text-xs text-muted-foreground">
          الفترة
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value as PeriodChoice)}
            className={`${inputClass} mt-1 w-44`}
          >
            {PERIOD_CHOICES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {choice === "custom" && (
          <>
            <label className="block text-xs text-muted-foreground">
              من
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} tabular mt-1`} />
            </label>
            <label className="block text-xs text-muted-foreground">
              إلى
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} tabular mt-1`} />
            </label>
          </>
        )}
        {data && (
          <Button variant="ghost" className="ms-auto" onClick={() => window.print()}>
            طباعة / حفظ PDF
          </Button>
        )}
      </Card>

      {choice === "custom" && (!from || !to) ? (
        <Empty title="اختر تاريخي البداية والنهاية للنطاق المخصص." />
      ) : !data ? (
        <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="التقارير" />
      ) : (
        <ReportBody data={data} />
      )}
    </div>
  );
}

function ReportBody({ data }: { data: ReportData }) {
  const { kpis, enabled } = data;
  const disabled = (key: keyof ReportData["enabled"], label: string) =>
    !enabled[key] ? <Empty title={`${label} غير مفعّلة — فعّلها من الإعدادات ليظهر قسمها بالتقرير.`} /> : null;

  return (
    <div className="space-y-5">
      {/* رأس التقرير — يظهر عند الطباعة */}
      <div className="print:mb-4 print:border-b print:border-border print:pb-3">
        <h2 className="font-naskh text-xl font-bold">{data.mosque.name}</h2>
        <p className="text-sm text-muted-foreground">
          تقرير الفترة: {periodLabel(data.period)}
          <span className="tabular"> ({data.period.from} — {data.period.to})</span>
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="الحلقات" value={kpis.halaqatCount} />
        <Stat label="الطلاب النشطون" value={kpis.activeStudents} hint="من حلقات الجامع" />
        {enabled.registration && <Stat label="تسجيلات بانتظار التوزيع" value={kpis.pendingRegistrations} />}
        {enabled.families && <Stat label="الأسر" value={kpis.familiesCount} />}
        {enabled.committees && (
          <Stat label="اللجان" value={kpis.committeesCount} hint={`${kpis.openTasks} مهمة مفتوحة`} />
        )}
        {enabled.weekly_evaluation && (
          <Stat
            label="متوسط التقييم"
            value={kpis.evaluationsAvgPercent === null ? "—" : `${kpis.evaluationsAvgPercent}٪`}
            hint="نسبة الدرجات من العظمى"
          />
        )}
        {enabled.badges && <Stat label="الأوسمة الممنوحة" value={kpis.badgesAwarded} hint="خلال الفترة" />}
        {kpis.activities !== null && <Stat label="الأنشطة" value={kpis.activities} hint="خلال الفترة" />}
      </div>

      {kpis.unreachableHalaqat > 0 && (
        <p className="text-xs text-accent">
          تعذّر جلب إحصائيات {kpis.unreachableHalaqat} حلقة — استُثنيت من الإجمالي.
        </p>
      )}

      {enabled.weekly_evaluation ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <TopTable
            title="أعلى 5 أسر بالتقييم"
            filename="report-top-families.csv"
            emptyText="لا درجات تقييم للأسرة في هذه الفترة."
            rows={data.topFamilies}
          />
          <TopTable
            title="أعلى 5 طلاب بالتقييم"
            filename="report-top-students.csv"
            emptyText="لا درجات تقييم للطلاب في هذه الفترة."
            rows={data.topStudents}
          />
        </div>
      ) : (
        disabled("weekly_evaluation", "ميزة التقييم الأسبوعي")
      )}

      {enabled.halaqat && (
        <TableCard
          title="الحلقات"
          filename="report-halaqat.csv"
          headers={["الحلقة", "المعلّم", "الطلاب النشطون", "متوسط الإتقان", "إجمالي المحفوظ", "الحضور", "وردات معتمدة", "الخطة على المسار", "التسميعات"]}
        >
          {data.halaqat.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا حلقات بعد.</p>
          ) : (
            data.halaqat.map((halaqah) => (
              <tr key={halaqah.name} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-2 font-medium">{halaqah.name}</td>
                <td className="px-2 py-2 text-muted-foreground">{halaqah.teacher}</td>
                <td className="tabular px-2 py-2 text-center">
                  {halaqah.activeStudents === null ? <Badge tone="warn">غير متاح</Badge> : halaqah.activeStudents}
                </td>
                <td className="tabular px-2 py-2 text-center">
                  {halaqah.avgMastery === null ? "—" : `${halaqah.avgMastery}٪`}
                </td>
                <td className="tabular px-2 py-2 text-center">{halaqah.totalPages ?? "—"}</td>
                <td className="tabular px-2 py-2 text-center">
                  {halaqah.metrics?.attendanceRate == null ? "—" : `${Math.round(halaqah.metrics.attendanceRate)}٪`}
                </td>
                <td
                  className="tabular px-2 py-2 text-center"
                  title={halaqah.metrics ? `من ${halaqah.metrics.wardsSubmitted} مُقدَّمة` : undefined}
                >
                  {halaqah.metrics ? halaqah.metrics.wardsApproved : "—"}
                </td>
                <td className="tabular px-2 py-2 text-center">
                  {halaqah.metrics?.planOnTrackRatio == null
                    ? "—"
                    : `${Math.round(halaqah.metrics.planOnTrackRatio * 100)}٪`}
                </td>
                <td
                  className="tabular px-2 py-2 text-center"
                  title={halaqah.metrics?.recitationsAvgScore != null ? `متوسط ${halaqah.metrics.recitationsAvgScore}` : undefined}
                >
                  {halaqah.metrics ? halaqah.metrics.recitationsCount : "—"}
                </td>
              </tr>
            ))
          )}
        </TableCard>
      )}

      {enabled.badges ? (
        <TableCard title="الأوسمة الممنوحة" filename="report-badges.csv" headers={["الوسام", "مرات المنح"]}>
          {data.badges.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا أوسمة ممنوحة في هذه الفترة.</p>
          ) : (
            data.badges.map((badge) => (
              <tr key={badge.name} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-2 font-medium">
                  <span className="me-1">{badge.icon}</span>
                  {badge.name}
                </td>
                <td className="tabular px-2 py-2 text-center">{badge.count}</td>
              </tr>
            ))
          )}
        </TableCard>
      ) : (
        disabled("badges", "ميزة الأوسمة")
      )}
    </div>
  );
}

/** بطاقة جدول مع تصدير CSV — الزر يختفي عند الطباعة */
function TableCard({
  title,
  filename,
  headers,
  children,
}: {
  title: string;
  filename: string;
  headers: string[];
  children: React.ReactNode;
}) {
  function tableRows() {
    const table = document.querySelector<HTMLTableElement>(`table[data-csv-filename="${filename}"]`);
    return Array.from(table?.querySelectorAll("tbody tr") ?? []).map((row) =>
      Array.from(row.children).map((cell) => cell.textContent?.trim() ?? ""),
    );
  }

  return (
    <Card className="overflow-x-auto p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Button variant="ghost" className="!px-3 !py-1 text-xs print:hidden" onClick={() => exportCsv(filename, headers, tableRows())}>
          تصدير CSV
        </Button>
      </div>
      <table className="w-full text-sm" data-csv-filename={filename}>
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            {headers.map((header) => (
              <th key={header} className="px-2 py-2 text-start font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </Card>
  );
}

function TopTable({
  title,
  filename,
  emptyText,
  rows,
}: {
  title: string;
  filename: string;
  emptyText: string;
  rows: TopRow[];
}) {
  return (
    <TableCard title={title} filename={filename} headers={["#", "الاسم", "المجموع", "النسبة"]}>
      {rows.length === 0 ? (
        <tr>
          <td colSpan={4} className="px-2 py-4 text-center text-sm text-muted-foreground">
            {emptyText}
          </td>
        </tr>
      ) : (
        rows.map((row, index) => (
          <tr key={row.name} className="border-b border-border/60 last:border-0">
            <td className="w-10 px-2 py-2">
              <Badge tone={index === 0 ? "warn" : "neutral"}>{index + 1}</Badge>
            </td>
            <td className="px-2 py-2 font-medium">{row.name}</td>
            <td className="tabular px-2 py-2 text-center">
              {row.total} / {row.maxTotal}
            </td>
            <td className="tabular px-2 py-2 text-center">{row.percent}٪</td>
          </tr>
        ))
      )}
    </TableCard>
  );
}

/** CSV بترميز UTF-8 مع BOM حتى تفتح العربية سليمة ببرامج الجداول */
function exportCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    let text = String(value);
    // حقن الصيغ في برامج الجداول: خلية نصية تبدأ بـ = + - @ (أو tab/CR) تُسبق بـ '
    if (/^[=+@\t\r-]/.test(text) && !/^-?\d+(\.\d+)?%?$/.test(text)) text = `'${text}`;
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
