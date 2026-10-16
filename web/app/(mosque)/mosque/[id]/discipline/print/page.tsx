"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Button, Empty } from "@/components/mosque/ui";
import { MosquePage } from "@/components/mosque/mosque-page";
import { DisciplineDoc } from "@/components/discipline-doc";
import { DISCIPLINE_NOTE_MAX, DOC_KIND_LABEL, docKindsForEvent, type DisciplineConfig, type DisciplineDocKind } from "@/lib/discipline";
import type { DisciplineEventRow } from "@/lib/discipline-db";

/*
  A2 — طباعة مستند انضباط من لوحة إدارة الجامع:
  /mosque/[id]/discipline/print?event=<id>&doc=<warning|pledge|summons>
*/

type DisciplineData = {
  config: DisciplineConfig;
  events: DisciplineEventRow[];
  mosqueName?: string;
};

const DOC_KINDS: DisciplineDocKind[] = ["warning", "pledge", "summons"];

export default function MosqueDisciplinePrintPage() {
  return (
    <Suspense>
      <PrintDoc />
    </Suspense>
  );
}

function PrintDoc() {
  const routeParams = useParams<{ id: string }>();
  const mosqueId = Number(routeParams.id);
  const params = useSearchParams();
  const eventId = Number(params.get("event"));
  const docParam = params.get("doc");
  const docKind = (DOC_KINDS as string[]).includes(docParam ?? "") ? (docParam as DisciplineDocKind) : null;

  const [data, setData] = useState<DisciplineData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mosques/${mosqueId}/discipline`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((d: DisciplineData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [mosqueId]);

  const event = data?.events.find((e) => e.id === eventId);
  const docAllowed = event && docKind && docKindsForEvent(event.kind, event.level).includes(docKind);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/discipline`} title="طباعة مستند">
      {failed ? (
        <Empty title="تعذّر تحميل المستند." />
      ) : !data ? (
        <Empty title="جارٍ التحميل…" />
      ) : !event || !docKind || !docAllowed ? (
        <Empty title="المستند غير متاح لهذا الحدث." />
      ) : (
        <div className="space-y-4">
          <div className="discipline-doc-print-hidden flex flex-wrap items-center justify-between gap-2">
            <Link href={`/mosque/${mosqueId}/discipline`} className="text-sm text-primary hover:underline">
              ← العودة للانضباط
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{DOC_KIND_LABEL[docKind]}</span>
              <Button onClick={() => window.print()}>طباعة</Button>
            </div>
          </div>

          <DisciplineDoc
            doc={{
              mosqueName: data.mosqueName ?? "",
              halaqahName: event.halaqahName ?? "",
              studentName: event.studentName,
              docKind,
              eventDate: event.createdAt.slice(0, 10),
              reason: event.reason.slice(0, DISCIPLINE_NOTE_MAX * 2),
            }}
          />
        </div>
      )}
    </MosquePage>
  );
}
