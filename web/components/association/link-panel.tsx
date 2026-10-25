"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/mosque/ui";
import { callApi, useApi } from "@/components/mosque/use-api";
import { inputClass } from "@/components/mosque/mosque-page";
import { LINK_STATUS_LABEL, type LinkRequestedBy, type LinkStatus } from "@/lib/association-links";

/*
  «ربط جامع»: الجمعية ترسل طلباً لجامع قائم (يقبله مدير ذلك الجامع من
  إعداداته)، وتقرر هنا طلبات الجوامع الجديدة التي اختارتها عند تسجيلها.
*/

type Link = {
  id: number;
  mosqueId: number;
  mosqueName: string;
  mosqueCity: string;
  requestedBy: LinkRequestedBy;
  status: LinkStatus;
};
type Found = { id: number; name: string; city: string };

const TONE = { pending: "warn", approved: "good", declined: "neutral" } as const;

export function AssociationLinkPanel() {
  const { data, reload } = useApi<{ links: Link[] }>("/api/association/link-requests");
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function search() {
    setError(null);
    setMessage(null);
    if (q.trim().length < 2) {
      setError("اكتب حرفين على الأقل من اسم الجامع");
      return;
    }
    const res = await fetch(`/api/association/link-requests?q=${encodeURIComponent(q.trim())}`);
    const d = (await res.json().catch(() => ({}))) as { mosques?: Found[] };
    setFound(d.mosques ?? []);
  }

  async function send(mosqueId: number) {
    setBusyId(mosqueId);
    setError(null);
    const result = await callApi("/api/association/link-requests", "POST", { mosqueId });
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setMessage("أُرسل طلب الربط — بانتظار موافقة مدير الجامع.");
    setFound(null);
    setQ("");
    reload();
  }

  async function decide(id: number, accept: boolean) {
    setBusyId(id);
    setError(null);
    const result = await callApi(`/api/association/link-requests/${id}`, "POST", { accept });
    setBusyId(null);
    if (!result.ok) {
      setError(result.error);
      if (result.status === 409 || result.status === 404) reload();
      return;
    }
    reload();
  }

  const links = data?.links ?? [];
  const incoming = links.filter((l) => l.requestedBy === "mosque" && l.status === "pending");
  const others = links.filter((l) => !(l.requestedBy === "mosque" && l.status === "pending"));

  return (
    <section className="space-y-3" aria-labelledby="link-panel-title">
      <h2 id="link-panel-title" className="font-display text-lg font-bold">
        ربط جامع
      </h2>

      {incoming.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-semibold">جوامع طلبت الانضمام لجمعيتكم</p>
          {incoming.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {l.mosqueName}
                {l.mosqueCity ? <span className="text-xs text-muted-foreground"> — {l.mosqueCity}</span> : null}
              </span>
              <span className="flex gap-2">
                <Button type="button" disabled={busyId === l.id} onClick={() => decide(l.id, true)}>
                  قبول
                </Button>
                <Button type="button" variant="danger" disabled={busyId === l.id} onClick={() => decide(l.id, false)}>
                  اعتذار
                </Button>
              </span>
            </div>
          ))}
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          ابحث باسم جامع قائم لإرسال طلب ربط؛ يظهر الجامع في لوحتكم بعد قبول مديره.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
            placeholder="اسم الجامع"
            maxLength={60}
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button type="button" onClick={() => void search()}>
            بحث
          </Button>
        </div>
        {found && found.length === 0 && <p className="text-sm text-muted-foreground">لا نتائج.</p>}
        {found && found.length > 0 && (
          <ul className="space-y-2">
            {found.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  {m.name}
                  {m.city ? <span className="text-xs text-muted-foreground"> — {m.city}</span> : null}
                </span>
                <Button type="button" disabled={busyId === m.id} onClick={() => send(m.id)}>
                  {busyId === m.id ? "لحظة…" : "إرسال طلب ربط"}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {message && <p className="text-sm text-success">{message}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {others.length > 0 && (
        <Card className="space-y-2 p-4">
          <p className="text-sm font-semibold">سجل الطلبات</p>
          {others.map((l) => (
            <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {l.mosqueName}{" "}
                <span className="text-xs text-muted-foreground">
                  ({l.requestedBy === "association" ? "أرسلتموه" : "طلبه الجامع"})
                </span>
              </span>
              <Badge tone={TONE[l.status]}>{LINK_STATUS_LABEL[l.status]}</Badge>
            </div>
          ))}
        </Card>
      )}
    </section>
  );
}
