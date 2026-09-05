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
  needs_revision: "يحتاج إعادة",
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

const REVISION_NOTE_MAX = 500;

export default function InboxPage() {
  const [wards, setWards] = useState<WardLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyNew, setOnlyNew] = useState(false);

  // حالة نموذج "طلب إعادة" — ورد واحد مفتوح كحد أقصى في كل مرة
  const [revisionOpenId, setRevisionOpenId] = useState<number | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);

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

  function openRevisionForm(id: number) {
    setRevisionOpenId(id);
    setRevisionNote("");
    setRevisionError(null);
  }

  function closeRevisionForm() {
    setRevisionOpenId(null);
    setRevisionNote("");
    setRevisionError(null);
  }

  /** طلب إعادة له تدفق خاص (يتطلّب ملاحظة، ويعرض الخطأ صراحة) — لا يشارك setStatus أعلاه */
  async function submitRevision(id: number) {
    const note = revisionNote.trim();
    if (!note) {
      setRevisionError("اكتب ملاحظة توضّح سبب طلب الإعادة");
      return;
    }
    setRevisionBusy(true);
    setRevisionError(null);
    try {
      const res = await fetch("/api/wards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "needs_revision", note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setRevisionError(data.error ?? "تعذّر إرسال طلب الإعادة");
        return;
      }
      setWards((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: "needs_revision", reviewNote: note } : w)),
      );
      closeRevisionForm();
    } catch {
      setRevisionError("تعذّر الاتصال بالخادم");
    } finally {
      setRevisionBusy(false);
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

              {ward.previousAttemptId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ↩ محاولة معادة بعد طلب إعادة سابق
                </p>
              )}

              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {rangeText(ward.hifz) && <p>حفظ: {rangeText(ward.hifz)}</p>}
                {rangeText(ward.review) && <p>مراجعة: {rangeText(ward.review)}</p>}
                {ward.note && <p className="text-foreground">«{ward.note}»</p>}
                {ward.status === "needs_revision" && ward.reviewNote && (
                  <p className="text-accent">سبب طلب الإعادة: «{ward.reviewNote}»</p>
                )}
              </div>

              {(ward.status === "new" || ward.status === "seen") && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
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
                    <Button
                      variant="ghost"
                      onClick={() =>
                        revisionOpenId === ward.id ? closeRevisionForm() : openRevisionForm(ward.id)
                      }
                      className="text-xs"
                    >
                      طلب إعادة
                    </Button>
                  </div>

                  {revisionOpenId === ward.id && (
                    <div className="space-y-1 rounded-md border border-border bg-surface p-3">
                      <label className="block text-xs text-muted-foreground">
                        سبب طلب الإعادة (إلزامي)
                        <textarea
                          value={revisionNote}
                          onChange={(e) => setRevisionNote(e.target.value.slice(0, REVISION_NOTE_MAX))}
                          maxLength={REVISION_NOTE_MAX}
                          rows={2}
                          placeholder="مثال: راجع صفحة ٤٥ مرة أخرى، فيها تعثّر واضح"
                          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />
                      </label>
                      <div className="flex items-center justify-between">
                        <span className="tabular text-xs text-muted-foreground">
                          {revisionNote.length}/{REVISION_NOTE_MAX}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            onClick={closeRevisionForm}
                            className="text-xs"
                            disabled={revisionBusy}
                          >
                            إلغاء
                          </Button>
                          <Button
                            onClick={() => submitRevision(ward.id)}
                            className="text-xs"
                            disabled={revisionBusy || !revisionNote.trim()}
                          >
                            {revisionBusy ? "يُرسل…" : "إرسال طلب الإعادة"}
                          </Button>
                        </div>
                      </div>
                      {revisionError && <p className="text-xs text-destructive">{revisionError}</p>}
                    </div>
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
