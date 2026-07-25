"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { useStudentSession } from "@/components/student-gate";
import { juzLabel, juzesOfRange } from "@/lib/quran";
import type { PageRange, WardLog, WardStatus } from "@/lib/types";

const STATUS_LABEL: Record<WardStatus, string> = {
  new: "بانتظار الاطّلاع",
  seen: "اطّلع المعلّم",
  approved: "معتمد",
};

function statusTone(status: WardStatus): "neutral" | "good" | "warn" {
  if (status === "approved") return "good";
  if (status === "seen") return "neutral";
  return "warn";
}

function rangeText(range: PageRange | null): string | null {
  if (!range) return null;
  const juz = juzLabel(juzesOfRange(range.from, range.to));
  return `صفحة ${range.from} إلى ${range.to} · ${juz}`;
}

export default function StudentWardPage() {
  const student = useStudentSession();
  const [hifzFrom, setHifzFrom] = useState("");
  const [hifzTo, setHifzTo] = useState("");
  const [reviewFrom, setReviewFrom] = useState("");
  const [reviewTo, setReviewTo] = useState("");
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const [logs, setLogs] = useState<WardLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const loadLogs = useCallback(() => {
    fetch("/api/wards/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { wards?: WardLog[] } | null) => {
        if (data) setLogs(data.wards ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  function rangeBody(from: string, to: string): PageRange | null {
    const f = Number(from);
    const t = Number(to);
    if (!from || !to || !Number.isFinite(f) || !Number.isFinite(t)) return null;
    return { from: f, to: t };
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const res = await fetch("/api/wards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hifz: rangeBody(hifzFrom, hifzTo),
          review: rangeBody(reviewFrom, reviewTo),
          note: note.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إرسال الورد");
        return;
      }
      setSent(true);
      setHifzFrom("");
      setHifzTo("");
      setReviewFrom("");
      setReviewTo("");
      setNote("");
      loadLogs();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-naskh text-2xl font-bold">ورد اليوم</h1>
        <p className="text-sm text-muted-foreground">
          {student ? `حيّاك الله يا ${student.name}` : ""}
          {student?.halaqahName ? ` · ${student.halaqahName}` : ""}
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">الحفظ الجديد</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted-foreground">من صفحة</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  inputMode="numeric"
                  value={hifzFrom}
                  onChange={(e) => setHifzFrom(e.target.value)}
                  className={`tabular ${field}`}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">إلى صفحة</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  inputMode="numeric"
                  value={hifzTo}
                  onChange={(e) => setHifzTo(e.target.value)}
                  className={`tabular ${field}`}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">المراجعة</legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-muted-foreground">من صفحة</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  inputMode="numeric"
                  value={reviewFrom}
                  onChange={(e) => setReviewFrom(e.target.value)}
                  className={`tabular ${field}`}
                />
              </label>
              <label className="block">
                <span className="text-xs text-muted-foreground">إلى صفحة</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  inputMode="numeric"
                  value={reviewTo}
                  onChange={(e) => setReviewTo(e.target.value)}
                  className={`tabular ${field}`}
                />
              </label>
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs text-muted-foreground">ملاحظة (اختياري)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="مثال: تعثّرت في آخر صفحة"
              className={field}
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {sent && <p className="text-sm text-success">تم إرسال وردك إلى معلّمك ✓</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "يُرسل…" : "أرسل وردي"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            سجّل حفظاً أو مراجعة أو كليهما، ثم أرسل.
          </p>
        </form>
      </Card>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">أورادي الأخيرة</h2>
        {loadingLogs ? (
          <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
        ) : logs.length === 0 ? (
          <Empty title="لم ترسل أي ورد بعد." />
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => (
              <Card key={log.id} className="p-3">
                <div className="flex items-baseline justify-between">
                  <span className="tabular text-sm font-medium">{log.date}</span>
                  <Badge tone={statusTone(log.status)}>{STATUS_LABEL[log.status]}</Badge>
                </div>
                <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {rangeText(log.hifz) && <p>حفظ: {rangeText(log.hifz)}</p>}
                  {rangeText(log.review) && <p>مراجعة: {rangeText(log.review)}</p>}
                  {log.note && <p className="text-foreground">{log.note}</p>}
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
