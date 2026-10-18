"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import {
  DEFAULT_PERMITS_CONFIG,
  PERMITS_CONFIG_FIELDS,
  PERMIT_ACTION_LABELS,
  PERMIT_NOTES_MAX,
  PERMIT_STATUS_LABELS,
  type PermitAction,
  type PermitsConfig,
  type PermitStatus,
} from "@/lib/permits";
import type { PermitsOverview } from "@/lib/permits-db";

/*
  A3 — تصاريح الحلقات: بطاقات اقتراحات قابلة للتنفيذ (لا تُنفَّذ تلقائياً)،
  حالة تصريح كل حلقة بالعام الدراسي، الإجراءات اليدوية المسموحة لحالتها، سجل
  التدقيق، وإعدادات العتبات. كل تغيير يمرّ بمسار مسجَّل في permits_log.
*/

const STATUS_TONE: Record<PermitStatus, "good" | "warn" | "neutral"> = {
  active: "good",
  pending_renewal: "warn",
  suspended: "warn",
  withdrawn: "neutral",
};

/** الإجراءات اليدوية المتاحة لكل حالة — تطابق آلة الحالات في lib/permits.ts */
function actionsFor(status: PermitStatus | null): PermitAction[] {
  switch (status) {
    case null:
      return ["issue"];
    case "active":
      return ["request_renewal", "suspend", "withdraw"];
    case "pending_renewal":
      return ["renew", "suspend", "withdraw"];
    case "suspended":
      return ["reactivate", "withdraw"];
    default:
      return [];
  }
}

export default function MosquePermitsPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const { data, status, loading, reload } = useApi<PermitsOverview>(`/api/mosques/${mosqueId}/permits`);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/permits`} title="تصاريح الحلقات">
      <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="تصاريح الحلقات" />
      {data && <PermitsPanel mosqueId={mosqueId} data={data} onChanged={reload} />}
    </MosquePage>
  );
}

function PermitsPanel({ mosqueId, data, onChanged }: { mosqueId: number; data: PermitsOverview; onChanged: () => void }) {
  const [notes, setNotes] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(halaqahId: number, action: PermitAction) {
    setBusyKey(`${halaqahId}:${action}`);
    setError(null);
    const res = await callApi(`/api/mosques/${mosqueId}/permits/${halaqahId}`, "POST", { action, notes });
    setBusyKey(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotes("");
    onChanged();
  }

  async function requestUpgrade() {
    setBusyKey("upgrade");
    setError(null);
    const res = await callApi(`/api/mosques/${mosqueId}/permits`, "POST", { action: "upgrade_request", notes });
    setBusyKey(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setNotes("");
    onChanged();
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-2 p-4">
        <p className="text-sm">
          العام الدراسي الحالي: <span className="tabular font-semibold">{data.academicYear} هـ</span>
        </p>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">ملاحظة تُسجَّل مع الإجراء التالي (اختياري)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, PERMIT_NOTES_MAX))}
            className={inputClass}
            maxLength={PERMIT_NOTES_MAX}
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">اقتراحات</h2>
        {data.suggestions.length === 0 ? (
          <Empty title="لا اقتراحات حالياً." />
        ) : (
          data.suggestions.map((s) => (
            <Card
              key={s.id}
              className={`flex flex-wrap items-center justify-between gap-3 p-4 ${s.urgency === "overdue" ? "border-accent/40 bg-accent/5" : ""}`}
            >
              <p className="min-w-0 flex-1 text-sm">{s.messageAr}</p>
              {s.kind === "upgrade" ? (
                <Button type="button" disabled={busyKey === "upgrade"} onClick={requestUpgrade}>
                  تسجيل طلب الترقية
                </Button>
              ) : (
                s.action &&
                s.halaqahId !== null && (
                  <Button
                    type="button"
                    variant={s.kind === "withdraw" ? "danger" : "primary"}
                    disabled={busyKey === `${s.halaqahId}:${s.action}`}
                    onClick={() => act(s.halaqahId as number, s.action as PermitAction)}
                  >
                    {PERMIT_ACTION_LABELS[s.action]}
                  </Button>
                )
              )}
            </Card>
          ))
        )}
        <p className="text-xs text-muted-foreground">الاقتراحات لا تُنفَّذ من تلقاء نفسها — التنفيذ يدوي ومسجَّل.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">حلقات الجامع</h2>
        {data.halaqat.length === 0 ? (
          <Empty title="لا حلقات مرتبطة بهذا الجامع." />
        ) : (
          data.halaqat.map((h) => {
            const permitStatus = h.permit?.status ?? null;
            return (
              <Card key={h.halaqahId} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.activeStudents} طالباً فعّالاً
                      {h.permit?.renewalDue ? ` · التجديد القادم: ${h.permit.renewalDue}` : ""}
                      {h.permit && h.permit.suspensionsCount > 0 ? ` · الإيقافات: ${h.permit.suspensionsCount}` : ""}
                    </p>
                  </div>
                  {permitStatus ? (
                    <Badge tone={STATUS_TONE[permitStatus]}>{PERMIT_STATUS_LABELS[permitStatus]}</Badge>
                  ) : (
                    <Badge>بلا تصريح</Badge>
                  )}
                </div>
                {actionsFor(permitStatus).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {actionsFor(permitStatus).map((action) => (
                      <Button
                        key={action}
                        type="button"
                        variant={action === "issue" || action === "renew" || action === "reactivate" ? "primary" : "ghost"}
                        disabled={busyKey === `${h.halaqahId}:${action}`}
                        onClick={() => act(h.halaqahId, action)}
                      >
                        {PERMIT_ACTION_LABELS[action]}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </Card>
            );
          })
        )}
      </section>

      <SettingsCard mosqueId={mosqueId} initial={data.config} onSaved={onChanged} />

      <section className="space-y-2">
        <h2 className="font-display text-lg font-bold">سجل التدقيق</h2>
        {data.log.length === 0 ? (
          <Empty title="لا إجراءات مسجَّلة بعد." />
        ) : (
          <Card className="divide-y divide-border">
            {data.log.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  {PERMIT_ACTION_LABELS[entry.action as PermitAction] ?? (entry.action === "upgrade_request" ? "طلب ترقية إلى مجمع" : entry.action)}
                  {entry.halaqahName ? ` — ${entry.halaqahName}` : ""}
                  {entry.fromStatus || entry.toStatus
                    ? ` (${entry.fromStatus ? PERMIT_STATUS_LABELS[entry.fromStatus as PermitStatus] : "—"} ← ${entry.toStatus ? PERMIT_STATUS_LABELS[entry.toStatus as PermitStatus] : "—"})`
                    : ""}
                </span>
                <span className="tabular text-xs text-muted-foreground">
                  {entry.actorKind === "developer" ? "المشرف العام" : "مدير الجامع"} · {entry.createdAt.slice(0, 10)}
                </span>
              </div>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function SettingsCard({ mosqueId, initial, onSaved }: { mosqueId: number; initial: PermitsConfig; onSaved: () => void }) {
  const [config, setConfig] = useState<PermitsConfig>(initial);
  const [seen, setSeen] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (seen !== initial) {
    setSeen(initial);
    setConfig(initial);
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await callApi(`/api/mosques/${mosqueId}/permits/settings`, "PUT", config);
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
        <h2 className="font-display text-lg font-bold">إعدادات التصاريح</h2>
        <Button variant="ghost" type="button" onClick={() => setConfig(DEFAULT_PERMITS_CONFIG)}>
          الافتراضيات
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PERMITS_CONFIG_FIELDS.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="mb-1 block">{field.label}</span>
            <input
              type="number"
              min={field.min}
              max={field.max}
              value={config[field.key]}
              onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.target.value === "" ? 0 : Number(e.target.value) }))}
              className={inputClass}
            />
            <span className="mt-0.5 block text-xs text-muted-foreground">{field.hint}</span>
          </label>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-success">حُفظت الإعدادات.</p>}
      <Button type="button" disabled={busy} onClick={save}>
        {busy ? "لحظة…" : "حفظ الإعدادات"}
      </Button>
    </Card>
  );
}
