"use client";

import { BackButton } from "@/components/back-button";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, Empty } from "@/components/mosque/ui";
import { ScheduleGrid } from "@/components/mosque/schedule-grid";
import type { ScheduleSlot } from "@/lib/mosque/db";
import { BrandLockup } from "@/components/brand";

type PublicSchedule = { name: string; city: string; slots: ScheduleSlot[] };

/** الجدول الأسبوعي العام (رابط المشاركة) — للقراءة فقط، ويختفي إن عُطّلت الميزة */
export default function PublicSchedulePage() {
  const params = useParams<{ mosqueId: string }>();
  const mosqueId = Number(params.mosqueId);
  const [data, setData] = useState<PublicSchedule | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    fetch(`/api/mosques/${mosqueId}/public/schedule`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: PublicSchedule | null) => (d ? setData(d) : setMissing(true)))
      .catch(() => setMissing(true));
  }, [mosqueId]);

  if (missing) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <p className="text-sm text-destructive">الرابط غير صحيح أو الجدول غير متاح لهذا الجامع.</p>
      </main>
    );
  }
  if (!data) return <Empty title="جارٍ التحميل…" />;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
      <BackButton className="mb-3" />
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onLight" size={44} context="الجدول الأسبوعي" />
      </div>
      <h1 className="font-display mb-1 text-center text-2xl font-bold text-primary">{data.name}</h1>
      <p className="mb-6 text-center text-sm text-muted-foreground">
        الجدول الأسبوعي{data.city && <span> — {data.city}</span>}
      </p>

      <Card className="p-3">
        {data.slots.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">لم يُضَف برنامج للجدول بعد.</p>
        ) : (
          <ScheduleGrid slots={data.slots} />
        )}
      </Card>
    </main>
  );
}
