"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/mosque/ui";
import { callApi, useApi } from "@/components/mosque/use-api";
import { LINK_STATUS_LABEL, type LinkStatus } from "@/lib/association-links";

/*
  طلبات الجمعيات لربط هذا الجامع بها — تظهر في إعدادات مدير الجامع فقط
  (المسار يحصر القرار بمدير الجامع المستهدف). لا تُعرض للمشرف العام.
*/

type Link = { id: number; associationName: string; status: LinkStatus };
const TONE = { pending: "warn", approved: "good", declined: "neutral" } as const;

export function MosqueLinkRequestsCard() {
  const { data, reload } = useApi<{ links: Link[] }>("/api/mosque-admin/link-requests");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const links = data?.links ?? [];
  if (links.length === 0) return null;

  async function decide(id: number, accept: boolean) {
    setBusyId(id);
    setError(null);
    const result = await callApi(`/api/mosque-admin/link-requests/${id}`, "POST", { accept });
    setBusyId(null);
    if (!result.ok) setError(result.error);
    reload();
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">طلبات الارتباط بالجمعيات</h2>
      {links.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            جمعية <span className="font-semibold">{l.associationName}</span> تطلب ربط جامعكم بها
          </span>
          {l.status === "pending" ? (
            <span className="flex gap-2">
              <Button type="button" disabled={busyId === l.id} onClick={() => decide(l.id, true)}>
                قبول
              </Button>
              <Button type="button" variant="danger" disabled={busyId === l.id} onClick={() => decide(l.id, false)}>
                اعتذار
              </Button>
            </span>
          ) : (
            <Badge tone={TONE[l.status]}>{LINK_STATUS_LABEL[l.status]}</Badge>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
