"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import {
  ERROR_COUNT_MAX,
  bandFor,
  computeErrorScore,
  formatScore,
  type ErrorCounts,
  type ErrorGradingConfig,
} from "@/lib/error-grading";
import type { WardLog } from "@/lib/types";

/*
  لوحة تقييم الورد بنقاط الأخطاء (ميزة error_grading) لمعلّم الحلقة: عدّاد لكل
  نوع خطأ، والدرجة والتقدير يُحسبان فورياً بنفس دوال الخادم. الحفظ يرسل
  العدّادات فقط والخادم يعيد الحساب — الدرجة المعروضة هنا للمعاينة لا للثقة.
*/

export function WardErrorGrader({
  ward,
  config,
  onSaved,
}: {
  ward: WardLog;
  config: ErrorGradingConfig;
  onSaved: (id: number, grade: { score: number; band: string; counts: ErrorCounts }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<ErrorCounts>(ward.errorCounts ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const score = computeErrorScore(config, counts);
  const band = bandFor(config, score);
  const graded = ward.errorScore !== undefined;

  function bump(key: string, delta: number) {
    setCounts((prev) => {
      const next = Math.min(ERROR_COUNT_MAX, Math.max(0, (prev[key] ?? 0) + delta));
      return { ...prev, [key]: next };
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wards/grade", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ward.id, counts }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        score?: number;
        band?: string;
        counts?: ErrorCounts;
      };
      if (!res.ok || data.score === undefined || data.band === undefined) {
        setError(data.error ?? "تعذّر حفظ التقييم");
        return;
      }
      onSaved(ward.id, { score: data.score, band: data.band, counts: data.counts ?? counts });
      setOpen(false);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {graded && (
          <span className="tabular rounded bg-accent-soft px-2 py-1 text-xs font-semibold text-accent-ink">
            الدرجة {formatScore(ward.errorScore!)} · {ward.errorBand}
          </span>
        )}
        <Button variant="ghost" onClick={() => setOpen((v) => !v)} className="min-h-11 text-xs" aria-expanded={open}>
          {graded ? "تعديل التقييم" : "تقييم بالنقاط"}
        </Button>
      </div>

      {open && (
        <div className="space-y-3 rounded-md border border-border bg-surface p-3">
          <ul className="space-y-2">
            {config.errorTypes.map((type) => (
              <li key={type.key} className="flex items-center justify-between gap-2">
                <span className="min-w-0 text-sm">
                  {type.label} <span className="tabular text-xs text-muted-foreground">(−{formatScore(type.points)})</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => bump(type.key, -1)}
                    disabled={(counts[type.key] ?? 0) === 0}
                    aria-label={`إنقاص ${type.label}`}
                    className="size-11 cursor-pointer rounded-md border border-border bg-surface text-lg font-bold transition-colors duration-150 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    −
                  </button>
                  <span className="tabular w-8 text-center text-base font-bold" aria-live="polite">
                    {counts[type.key] ?? 0}
                  </span>
                  <button
                    type="button"
                    onClick={() => bump(type.key, 1)}
                    aria-label={`زيادة ${type.label}`}
                    className="size-11 cursor-pointer rounded-md border border-border bg-primary text-lg font-bold text-on-primary transition-colors duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    +
                  </button>
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
            <span className="text-sm text-muted-foreground">الدرجة</span>
            <span className="tabular text-lg font-bold" aria-live="polite">
              {formatScore(score)} / {config.baseScore} · {band}
            </span>
          </div>

          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy} className="min-h-11 text-xs">
              إلغاء
            </Button>
            <Button onClick={save} disabled={busy} className="min-h-11 text-xs">
              {busy ? "يُحفظ…" : "حفظ التقييم"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
