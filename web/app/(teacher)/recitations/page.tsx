"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Empty } from "@/components/ui";
import { RecitationPlayer, formatRecitationDate } from "@/components/recitation-card";
import {
  RECITATION_NOTE_MAX,
  formatDuration,
  formatRecitationRange,
  type RecitationView,
} from "@/lib/recitations";

/*
  STEP 64 — التلاوات: المعلّقة أولاً (الأقدم أولاً) ثم آخر المقيَّمة. المعلّم
  يستمع ويعطي درجة ١–١٠ وملاحظة اختيارية، والحفظ يحوّل الحالة إلى «تم التقييم»
  ويُشعر الطالب وأولياء أمره (من الخادم).
*/

function ReviewCard({ item, onSaved }: { item: RecitationView; onSaved: () => void }) {
  const reviewed = item.status === "reviewed";
  const [score, setScore] = useState<number | null>(item.score);
  const [note, setNote] = useState(item.teacherNote ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (score === null) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/recitations/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, note }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "تعذّر الحفظ");
        return;
      }
      onSaved();
    } catch {
      setError("تعذّر الاتصال — حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-semibold text-foreground">{item.studentName}</div>
          <div className="tabular text-xs text-muted-foreground">
            {formatRecitationRange(item)} · {formatDuration(item.durationSec)} · {formatRecitationDate(item.createdAt)}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            reviewed ? "bg-success-soft text-success" : "bg-accent-soft text-accent-ink"
          }`}
        >
          {reviewed ? "تم التقييم" : "بانتظار التقييم"}
        </span>
      </div>

      <RecitationPlayer id={item.id} />

      <div>
        <div className="mb-1 text-xs text-muted-foreground">الدرجة (من 10)</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="الدرجة">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={score === n}
              onClick={() => setScore(n)}
              className={`tabular h-9 w-9 cursor-pointer rounded-md border text-sm font-semibold transition-colors duration-200 ${
                score === n
                  ? "border-success bg-success text-white"
                  : "border-border bg-surface text-foreground hover:bg-muted"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={RECITATION_NOTE_MAX}
        rows={2}
        placeholder="ملاحظة للطالب (اختياري)"
        aria-label="ملاحظة للطالب"
        className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      {error && (
        <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={save}
        disabled={score === null || saving}
        className="cursor-pointer rounded-md bg-success px-4 py-1.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? "جارٍ الحفظ…" : reviewed ? "تحديث التقييم" : "حفظ التقييم"}
      </button>
    </Card>
  );
}

export default function TeacherRecitationsPage() {
  const [items, setItems] = useState<RecitationView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recitations")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((data: { recitations: RecitationView[] }) => {
        if (cancelled) return;
        setItems(data.recitations);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  const pending = items?.filter((r) => r.status === "pending") ?? [];
  const reviewed = items?.filter((r) => r.status === "reviewed") ?? [];

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold">التلاوات</h1>

      {items === null && !failed ? (
        <Empty title="جارٍ تحميل التلاوات…" />
      ) : items === null ? (
        <Empty title="تعذّر تحميل التلاوات." />
      ) : items.length === 0 ? (
        <Empty title="لا تلاوات بعد — ستظهر هنا عندما يرسلها الطلاب." />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              بانتظار التقييم <span className="tabular">({pending.length})</span>
            </h2>
            {pending.length === 0 ? (
              <Empty title="لا تلاوات معلّقة." />
            ) : (
              pending.map((r) => <ReviewCard key={r.id} item={r} onSaved={refresh} />)
            )}
          </section>

          {reviewed.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">آخر التلاوات المقيَّمة</h2>
              {reviewed.map((r) => (
                <ReviewCard key={r.id} item={r} onSaved={refresh} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
