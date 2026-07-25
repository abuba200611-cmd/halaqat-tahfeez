"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { PushToggle } from "@/components/push-toggle";
import { juzLabel, juzesOfRange } from "@/lib/quran";
import type { PageRange, WardLog, WardStatus } from "@/lib/types";

const STATUS_LABEL: Record<WardStatus, string> = {
  new: "جديد",
  seen: "مطّلع عليه",
  approved: "معتمد",
};

function statusTone(status: WardStatus): "neutral" | "good" | "warn" {
  if (status === "approved") return "good";
  if (status === "new") return "warn";
  return "neutral";
}

function rangeText(range: PageRange | null): string | null {
  if (!range) return null;
  return `صفحة ${range.from}–${range.to} · ${juzLabel(juzesOfRange(range.from, range.to))}`;
}

export default function InboxPage() {
  const [wards, setWards] = useState<WardLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyNew, setOnlyNew] = useState(false);

  const load = useCallback(() => {
    fetch("/api/wards")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { wards?: WardLog[] } | null) => {
        if (data) setWards(data.wards ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const newCount = useMemo(() => wards.filter((w) => w.status === "new").length, [wards]);
  const shown = onlyNew ? wards.filter((w) => w.status === "new") : wards;

  async function setStatus(id: number, status: WardStatus) {
    // تحديث متفائل ثم مزامنة
    setWards((prev) => prev.map((w) => (w.id === id ? { ...w, status } : w)));
    try {
      await fetch("/api/wards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      load();
    }
  }

  if (loading) {
    return <Empty title="جارٍ تحميل الوارد…" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-naskh text-2xl font-bold">
          الوارد{" "}
          {newCount > 0 && (
            <span className="tabular text-base font-normal text-accent">({newCount} جديد)</span>
          )}
        </h1>
        <PushToggle />
      </div>

      <div className="flex gap-2">
        {(
          [
            ["all", "الكل"],
            ["new", "الجديدة"],
          ] as const
        ).map(([value, label]) => {
          const on = (value === "new") === onlyNew;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setOnlyNew(value === "new")}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                on
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border bg-surface text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Empty
          title={
            onlyNew ? "لا أوراد جديدة — كل شيء مطّلع عليه." : "لم يصل أي ورد من الطلاب بعد."
          }
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((ward) => (
            <Card key={ward.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{ward.studentName}</span>
                  <span className="tabular text-xs text-muted-foreground">{ward.date}</span>
                </div>
                <Badge tone={statusTone(ward.status)}>{STATUS_LABEL[ward.status]}</Badge>
              </div>

              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {rangeText(ward.hifz) && <p>حفظ: {rangeText(ward.hifz)}</p>}
                {rangeText(ward.review) && <p>مراجعة: {rangeText(ward.review)}</p>}
                {ward.note && <p className="text-foreground">«{ward.note}»</p>}
              </div>

              {ward.status !== "approved" && (
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => setStatus(ward.id, "approved")} className="text-xs">
                    اعتماد
                  </Button>
                  {ward.status === "new" && (
                    <Button
                      variant="ghost"
                      onClick={() => setStatus(ward.id, "seen")}
                      className="text-xs"
                    >
                      اطّلعت
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
