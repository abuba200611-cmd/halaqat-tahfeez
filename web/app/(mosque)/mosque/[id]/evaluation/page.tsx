"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import { recentWeeks, summarizeWeek, weekLabel } from "@/lib/mosque/evaluation";
import type { Criterion, EvaluationEntry } from "@/lib/mosque/db";

type Kind = "family" | "student";
type WeekData = {
  week: string;
  kind: Kind;
  criteria: Criterion[];
  targets: { id: number; name: string }[];
  entries: EvaluationEntry[];
};

const cellKey = (targetId: number, criterionId: number) => `${targetId}:${criterionId}`;

/** التقييم الأسبوعي: شبكة أهداف × معايير لأسبوع (يبدأ السبت)، وجدول ملخص بالمجموع والترتيب */
export default function EvaluationPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/evaluation`} title="التقييم الأسبوعي">
      <Evaluation mosqueId={mosqueId} />
    </MosquePage>
  );
}

function Evaluation({ mosqueId }: { mosqueId: number }) {
  const [weeks] = useState(() => recentWeeks(12));
  const [week, setWeek] = useState(weeks[0]);
  const [kind, setKind] = useState<Kind>("family");
  const [tab, setTab] = useState<"entry" | "summary">("entry");

  const { data, status, loading, dataKey, reload } = useApi<WeekData>(
    `/api/mosques/${mosqueId}/evaluation?week=${week}&kind=${kind}`,
  );

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <label className="block text-xs text-muted-foreground">
          الأسبوع (يبدأ السبت)
          <select value={week} onChange={(e) => setWeek(e.target.value)} className={`${inputClass} mt-1 w-56`}>
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekLabel(w)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          تقييم
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={`${inputClass} mt-1 w-36`}>
            <option value="family">الأسر</option>
            <option value="student">الطلاب</option>
          </select>
        </label>
        <div className="flex gap-1 rounded-full bg-muted p-1">
          {(["entry", "summary"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={`cursor-pointer rounded-full px-4 py-1 text-sm transition-colors duration-200 ${
                tab === value ? "bg-surface font-semibold shadow-sm" : "text-muted-foreground"
              }`}
            >
              {value === "entry" ? "إدخال الدرجات" : "الملخص والترتيب"}
            </button>
          ))}
        </div>
        <Link
          href={`/mosque/${mosqueId}/evaluation/criteria`}
          className="ms-auto text-sm text-accent-ink hover:underline"
        >
          إدارة المعايير
        </Link>
      </Card>

      {!data ? (
        <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="التقييم الأسبوعي" />
      ) : data.criteria.length === 0 ? (
        <Empty
          title="لا توجد معايير تقييم فعّالة — حدّد معايير الجامع أولاً."
          action={
            <Link href={`/mosque/${mosqueId}/evaluation/criteria`} className="text-sm text-accent-ink hover:underline">
              إدارة المعايير
            </Link>
          }
        />
      ) : data.targets.length === 0 ? (
        <Empty title={kind === "family" ? "لا توجد أسر بعد — أنشئ الأسر من صفحة الأسر." : "لا يوجد طلاب بعد."} />
      ) : tab === "entry" ? (
        <Grid key={dataKey} mosqueId={mosqueId} data={data} onSaved={reload} />
      ) : (
        <Summary data={data} />
      )}
    </div>
  );
}

function Grid({ mosqueId, data, onSaved }: { mosqueId: number; data: WeekData; onSaved: () => void }) {
  const [cells, setCells] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.entries.map((e) => [cellKey(e.targetId, e.criterionId), String(e.score)])),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    const entries: { targetId: number; criterionId: number; score: number }[] = [];
    for (const target of data.targets) {
      for (const criterion of data.criteria) {
        const raw = (cells[cellKey(target.id, criterion.id)] ?? "").trim();
        if (raw === "") continue;
        const score = Number(raw);
        if (!Number.isInteger(score) || score < 0 || score > criterion.maxScore) {
          setMessage({ ok: false, text: `«${target.name}» — ${criterion.name}: الدرجة بين 0 و${criterion.maxScore}` });
          return;
        }
        entries.push({ targetId: target.id, criterionId: criterion.id, score });
      }
    }
    if (entries.length === 0) {
      setMessage({ ok: false, text: "لم تُدخل أي درجة." });
      return;
    }

    setBusy(true);
    setMessage(null);
    const result = await callApi(`/api/mosques/${mosqueId}/evaluation`, "PUT", {
      week: data.week,
      kind: data.kind,
      entries,
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? "تعذّر الحفظ" });
      return;
    }
    setMessage({ ok: true, text: `تم حفظ ${entries.length} درجة.` });
    onSaved();
  }

  return (
    <Card className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-2 py-2 text-start font-medium">{data.kind === "family" ? "الأسرة" : "الطالب"}</th>
              {data.criteria.map((criterion) => (
                <th key={criterion.id} className="px-2 py-2 text-center font-medium">
                  {criterion.name}
                  <span className="tabular block text-[11px]">من {criterion.maxScore}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.targets.map((target) => (
              <tr key={target.id} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-1.5 font-medium">{target.name}</td>
                {data.criteria.map((criterion) => {
                  const key = cellKey(target.id, criterion.id);
                  return (
                    <td key={criterion.id} className="px-2 py-1.5 text-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={criterion.maxScore}
                        step={1}
                        value={cells[key] ?? ""}
                        onChange={(e) => setCells((prev) => ({ ...prev, [key]: e.target.value }))}
                        aria-label={`${target.name} — ${criterion.name}`}
                        className="tabular w-16 rounded-lg border border-border bg-surface px-2 py-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ الدرجات"}
        </Button>
        {message && <p className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>{message.text}</p>}
      </div>
    </Card>
  );
}

function Summary({ data }: { data: WeekData }) {
  const rows = summarizeWeek(data.criteria, data.targets, data.entries);
  const maxTotal = data.criteria.reduce((sum, c) => sum + c.maxScore, 0);

  if (rows.length === 0) return <Empty title="لا درجات محفوظة لهذا الأسبوع بعد." />;

  return (
    <Card className="p-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="w-14 px-2 py-2 text-start font-medium">الترتيب</th>
              <th className="px-2 py-2 text-start font-medium">{data.kind === "family" ? "الأسرة" : "الطالب"}</th>
              <th className="px-2 py-2 text-center font-medium">المجموع</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.targetId} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-2">
                  <Badge tone={row.rank === 1 ? "warn" : "neutral"}>{row.rank}</Badge>
                </td>
                <td className="px-2 py-2 font-medium">{row.name}</td>
                <td className="tabular px-2 py-2 text-center">
                  {row.total}
                  <span className="text-xs text-muted-foreground"> / {maxTotal}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
