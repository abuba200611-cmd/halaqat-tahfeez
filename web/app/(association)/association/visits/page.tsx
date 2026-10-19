"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import { AssociationPage } from "@/components/association/association-page";
import { VISIT_STATUS_LABELS, type VisitStatus } from "@/lib/supervisor-visits";

/*
  B4 — زيارات المشرف التربوي من لوحة الجمعية: جدولة زيارة لجامع من جوامع
  الجمعية (اختيار الجامع ثم حلقة من حلقاته)، وقائمة زيارات الجمعية على
  كل جوامعها. النموذج والتقرير في صفحة الزيارة نفسها.
*/

type VisitsData = {
  visits: {
    id: number;
    status: VisitStatus;
    mosqueName: string;
    halaqahName: string;
    visitorName: string;
    scheduledFor: string;
    visitedAt: string | null;
    overallScore: number | null;
  }[];
  mosques: { mosqueId: number; name: string; enabled: boolean }[];
};

type MosqueHalaqahs = { halaqat: { halaqahId: number; name: string }[] };

const STATUS_TONE: Record<VisitStatus, "neutral" | "good" | "warn"> = {
  scheduled: "warn",
  done: "good",
  cancelled: "neutral",
};

export default function AssociationVisitsPage() {
  const { data, status, loading, reload } = useApi<VisitsData>(`/api/association/visits`);

  return (
    <AssociationPage title="زيارات المشرف التربوي" activeHref="/association/visits">
      <div className="space-y-5">
        {data && <ScheduleCard mosques={data.mosques} onScheduled={reload} />}
        {loading && !data && <Empty title="جارٍ التحميل…" />}
        {!loading && !data && <Empty title={status === 401 ? "سجّل دخولك أولاً." : "تعذّر تحميل البيانات."} />}
        {data && (
          <section className="space-y-2">
            <h2 className="font-display text-lg font-bold">زيارات الجمعية ({data.visits.length})</h2>
            {data.visits.length === 0 ? (
              <Empty title="لا زيارات بعد — جدّول أول زيارة من الأعلى." />
            ) : (
              data.visits.map((visit) => (
                <Card key={visit.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {visit.halaqahName}
                      <span className="text-xs font-normal text-muted-foreground"> · {visit.mosqueName}</span>
                    </p>
                    <p className="tabular text-xs text-muted-foreground">
                      {visit.visitorName || "مشرف الجمعية"} · {visit.scheduledFor}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[visit.status]}>{VISIT_STATUS_LABELS[visit.status]}</Badge>
                    {visit.overallScore !== null && <Badge tone="good">{visit.overallScore} من ١٠٠</Badge>}
                    <Link
                      href={`/association/visits/${visit.id}`}
                      className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                    >
                      {visit.status === "scheduled" ? "تعبئة التقييم" : "التفاصيل"}
                    </Link>
                    {visit.status === "done" && (
                      <Link
                        href={`/association/visits/${visit.id}/print`}
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
        )}
      </div>
    </AssociationPage>
  );
}

function ScheduleCard({
  mosques,
  onScheduled,
}: {
  mosques: { mosqueId: number; name: string; enabled: boolean }[];
  onScheduled: () => void;
}) {
  const [mosqueId, setMosqueId] = useState("");
  const [halaqahId, setHalaqahId] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const halaqat = useApi<MosqueHalaqahs>(mosqueId ? `/api/association/mosques/${mosqueId}` : null).data?.halaqat ?? [];

  async function schedule(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await callApi(`/api/association/visits`, "POST", {
      mosqueId: Number(mosqueId),
      halaqahId: Number(halaqahId),
      scheduledFor,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setHalaqahId("");
    setScheduledFor("");
    onScheduled();
  }

  const selected = mosques.find((m) => String(m.mosqueId) === mosqueId);

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-bold">جدولة زيارة</h2>
      <form onSubmit={schedule} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto_auto]" autoComplete="off">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">الجامع</span>
          <select
            value={mosqueId}
            onChange={(e) => {
              setMosqueId(e.target.value);
              setHalaqahId("");
            }}
            required
            className={inputClass}
          >
            <option value="">اختر جامعاً</option>
            {mosques.map((m) => (
              <option key={m.mosqueId} value={m.mosqueId}>
                {m.name}
                {m.enabled ? "" : " (الميزة معطّلة)"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">الحلقة</span>
          <select
            value={halaqahId}
            onChange={(e) => setHalaqahId(e.target.value)}
            required
            disabled={!mosqueId}
            className={inputClass}
          >
            <option value="">{mosqueId ? "اختر حلقة" : "اختر الجامع أولاً"}</option>
            {halaqat.map((h) => (
              <option key={h.halaqahId} value={h.halaqahId}>
                {h.name}
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
        <Button type="submit" disabled={busy || selected?.enabled === false}>
          {busy ? "لحظة…" : "جدولة"}
        </Button>
      </form>
      {selected?.enabled === false && <p className="text-sm text-destructive">الميزة معطّلة في هذا الجامع.</p>}
      {mosques.length > 0 && mosques.every((m) => !m.enabled) && (
        <p className="text-xs text-muted-foreground">
          ميزة «زيارات المشرف التربوي» معطّلة في كل جوامع الجمعية — تُفعَّل من إعدادات كل جامع.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
