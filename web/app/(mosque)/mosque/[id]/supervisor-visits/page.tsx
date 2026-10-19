"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import {
  DEFAULT_VISIT_CRITERIA,
  VISIT_STATUS_LABELS,
  type VisitCriterion,
  type VisitStatus,
} from "@/lib/supervisor-visits";

/*
  B4 — زيارات المشرف التربوي لإدارة الجامع: جدولة زيارة جديدة (حلقة من
  حلقات الجامع + موعد)، قائمة الزيارات بجميع حالاتها (لإدارة الجامع ومن
  جمعيته)، وضبط معايير التقييم. النموذج في صفحة الزيارة نفسها.
*/

type VisitListData = {
  visits: {
    id: number;
    status: VisitStatus;
    halaqahName: string;
    visitorKind: "association_admin" | "mosque_admin";
    visitorName: string;
    scheduledFor: string;
    visitedAt: string | null;
    overallScore: number | null;
    notes: string;
    recommendations: string;
  }[];
  criteria: VisitCriterion[];
};

const STATUS_TONE: Record<VisitStatus, "neutral" | "good" | "warn"> = {
  scheduled: "warn",
  done: "good",
  cancelled: "neutral",
};

export default function MosqueSupervisorVisitsPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const { data, status, loading, reload } = useApi<VisitListData>(`/api/mosques/${mosqueId}/supervisor-visits`);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/supervisor-visits`} title="زيارات المشرف التربوي">
      <ApiState loading={loading && !data} status={status} mosqueId={mosqueId} featureName="زيارات المشرف التربوي" />
      {data && (
        <div className="space-y-5">
          <ScheduleCard mosqueId={mosqueId} onScheduled={reload} />

          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold">الزيارات ({data.visits.length})</h2>
            {data.visits.length === 0 ? (
              <Empty title="لا زيارات بعد — جدول أول زيارة من الأعلى." />
            ) : (
              data.visits.map((visit) => (
                <Card key={visit.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{visit.halaqahName}</p>
                    <p className="text-xs text-muted-foreground">
                      {visit.visitorKind === "association_admin" ? "مشرف الجمعية" : "إدارة الجامع"}
                      {visit.visitorName ? ` · ${visit.visitorName}` : ""} · <span className="tabular">{visit.scheduledFor}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[visit.status]}>{VISIT_STATUS_LABELS[visit.status]}</Badge>
                    {visit.overallScore !== null && <Badge tone="good">{visit.overallScore} من ١٠٠</Badge>}
                    <Link
                      href={`/mosque/${mosqueId}/supervisor-visits/${visit.id}`}
                      className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                    >
                      {visit.status === "scheduled" ? "تعبئة التقييم" : "التفاصيل"}
                    </Link>
                    {visit.status === "done" && (
                      <Link
                        href={`/mosque/${mosqueId}/supervisor-visits/${visit.id}/print`}
                        className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                      >
                        طباعة
                      </Link>
                    )}
                  </div>
                </Card>
              ))
            )}
          </section>

          <CriteriaCard mosqueId={mosqueId} initial={data.criteria} onSaved={reload} />
        </div>
      )}
    </MosquePage>
  );
}

function ScheduleCard({ mosqueId, onScheduled }: { mosqueId: number; onScheduled: () => void }) {
  const [halaqahId, setHalaqahId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mosque = useApi<{ halaqahs: { id: number; halaqahName: string }[] }>(`/api/mosques/${mosqueId}`).data;

  async function schedule(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await callApi(`/api/mosques/${mosqueId}/supervisor-visits`, "POST", {
      halaqahId: Number(halaqahId),
      scheduledFor,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setScheduledFor("");
    onScheduled();
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-bold">جدولة زيارة</h2>
      <form onSubmit={schedule} className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">الحلقة</span>
          <select value={halaqahId} onChange={(e) => setHalaqahId(e.target.value)} required className={inputClass}>
            <option value="">اختر حلقة</option>
            {(mosque?.halaqahs ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.halaqahName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">موعد الزيارة</span>
          <input
            type="date"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? "لحظة…" : "جدولة"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

function CriteriaCard({
  mosqueId,
  initial,
  onSaved,
}: {
  mosqueId: number;
  initial: VisitCriterion[];
  onSaved: () => void;
}) {
  const [criteria, setCriteria] = useState<VisitCriterion[]>(initial);
  const [seen, setSeen] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (seen !== initial) {
    setSeen(initial);
    setCriteria(initial);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await callApi(`/api/mosques/${mosqueId}/supervisor-visits/settings`, "PUT", { criteria });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    onSaved();
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">معايير التقييم</h2>
        <Button variant="ghost" type="button" onClick={() => setCriteria(DEFAULT_VISIT_CRITERIA)}>
          الافتراضيات
        </Button>
      </div>
      {criteria.map((criterion, index) => (
        <div key={criterion.key} className="flex items-center gap-2">
          <input
            value={criterion.label}
            onChange={(e) =>
              setCriteria((prev) => prev.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)))
            }
            className={inputClass}
            maxLength={60}
          />
          <button
            type="button"
            className="cursor-pointer rounded-lg px-2 py-1 text-xs text-destructive hover:bg-muted disabled:opacity-40"
            disabled={criteria.length <= 1}
            onClick={() => setCriteria((prev) => prev.filter((_, i) => i !== index))}
          >
            حذف
          </button>
        </div>
      ))}
      <Button
        variant="ghost"
        type="button"
        onClick={() => setCriteria((prev) => [...prev, { key: `c${Date.now().toString(36)}`, label: "معيار جديد" }])}
      >
        إضافة معيار
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-success">حُفظت المعايير.</p>}
      <Button type="button" disabled={busy} onClick={save}>
        {busy ? "لحظة…" : "حفظ المعايير"}
      </Button>
    </Card>
  );
}
