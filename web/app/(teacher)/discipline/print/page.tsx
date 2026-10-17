"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Empty } from "@/components/ui";
import { DisciplineDoc } from "@/components/discipline-doc";
import { DISCIPLINE_NOTE_MAX, DOC_KIND_LABEL, docKindsForEvent, type DisciplineDocKind } from "@/lib/discipline";
import type { DisciplineConfig, DisciplineEventKind } from "@/lib/discipline";
import type { DisciplineEventRow } from "@/lib/discipline-db";

/*
  A2 — طباعة مستند انضباط (إنذار/تعهد/استدعاء) من سجل المعلّم:
  /discipline/print?event=<id>&doc=<warning|pledge|summons> — صفحة A4 RTL
  بترويسة الجامع وخانات التوقيع.
*/

type DisciplineData = {
  config: DisciplineConfig;
  mosqueName: string;
  halaqahName: string;
  events: DisciplineEventRow[];
};

const DOC_KINDS: DisciplineDocKind[] = ["warning", "pledge", "summons"];

export default function PrintPage() {
  return (
    <Suspense>
      <PrintDoc />
    </Suspense>
  );
}

function PrintDoc() {
  const params = useSearchParams();
  const eventId = Number(params.get("event"));
  const docParam = params.get("doc");
  const docKind = (DOC_KINDS as string[]).includes(docParam ?? "") ? (docParam as DisciplineDocKind) : null;

  const [data, setData] = useState<DisciplineData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discipline")
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
  }, []);

  if (failed) return <Empty title="تعذّر تحميل المستند." />;
  if (!data) return <Empty title="جارٍ التحميل…" />;

  const event = data.events.find((e) => e.id === eventId);
  if (!event || !docKind) return <Empty title="المستند غير موجود." />;
  if (!docKindsForEvent(event.kind as DisciplineEventKind, event.level).includes(docKind)) {
    return <Empty title="هذا المستند غير متاح لهذا الحدث." />;
  }

  return (
    <div className="space-y-4">
      <div className="discipline-doc-print-hidden flex flex-wrap items-center justify-between gap-2">
        <Link href="/discipline" className="text-sm text-primary hover:underline">
          ← العودة للانضباط
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{DOC_KIND_LABEL[docKind]}</span>
          <Button onClick={() => window.print()}>طباعة</Button>
        </div>
      </div>

      <DisciplineDoc
        doc={{
          mosqueName: data.mosqueName,
          halaqahName: data.halaqahName,
          studentName: event.studentName,
          docKind,
          eventDate: event.createdAt.slice(0, 10),
          reason: event.reason.slice(0, DISCIPLINE_NOTE_MAX * 2),
        }}
      />
    </div>
  );
}
