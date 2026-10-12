"use client";

import { useCallback, useEffect, useState } from "react";
import { AyahRangeInputs } from "@/components/ayah-range-field";
import { PLAN_STATUS_STYLE } from "@/components/monthly-plan-card";
import { Button, Card, Empty } from "@/components/ui";
import {
  PLAN_MAX_TARGET,
  PLAN_NOTES_MAX,
  PLAN_STATUS_LABEL,
  type PlanActual,
  type PlanProgress,
  type PlanTargets,
} from "@/lib/monthly-plan";
import { parseAyahRange, formatAyahRange, type AyahRangeInput } from "@/lib/ward-ayah";

type PlanRow = { studentId: string; name: string; plan: PlanTargets | null; actual: PlanActual; progress: PlanProgress };
type MonthData = {
  month: string;
  monthLabel: string;
  currentMonth: string;
  prevMonth: string | null;
  nextMonth: string | null;
  start: string;
  end: string;
  rows: PlanRow[];
};

const EMPTY_RANGE: AyahRangeInput = { from: { surah: null, ayah: null }, to: { surah: null, ayah: null } };
const FIELD =
  "tabular w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function rangeToInput(plan: PlanTargets | null): AyahRangeInput {
  const h = plan?.hifz;
  if (!h) return EMPTY_RANGE;
  return { from: { surah: h.fromSurah, ayah: h.fromAyah }, to: { surah: h.toSurah, ayah: h.toAyah } };
}

/** نطاق مكتمل وصالح → عدد صفحاته؛ وإلا null (لا يرمي) */
function rangePages(range: AyahRangeInput): number | null {
  try {
    const parsed = parseAyahRange(range, "الحفظ");
    return parsed ? parsed.pages.to - parsed.pages.from + 1 : null;
  } catch {
    return null;
  }
}

function rangeError(range: AyahRangeInput): string | null {
  try {
    parseAyahRange(range, "الحفظ");
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "نطاق غير صحيح";
  }
}

function ProgressBar({ pct }: { pct: number | null }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct ?? 0} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, pct ?? 0)}%` }} />
    </div>
  );
}

function PlanEditor({
  row,
  month,
  monthLabel,
  onClose,
  onSaved,
}: {
  row: PlanRow;
  month: string;
  monthLabel: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [hifzTarget, setHifzTarget] = useState(String(row.plan?.hifzPagesTarget ?? 0));
  const [reviewTarget, setReviewTarget] = useState(String(row.plan?.reviewPagesTarget ?? 0));
  const [range, setRange] = useState<AyahRangeInput>(() => rangeToInput(row.plan));
  const [notes, setNotes] = useState(row.plan?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeEmpty = range.from.surah == null && range.from.ayah == null && range.to.surah == null && range.to.ayah == null;
  const rangeProblem = rangeEmpty ? null : rangeError(range);
  const pages = rangeEmpty ? null : rangePages(range);

  function changeRange(next: AyahRangeInput) {
    setRange(next);
    // لو لم يُحدَّد مستهدف الحفظ بعد، نقترح عدد صفحات النطاق (يعدّله المعلّم بحرية)
    const nextPages = rangePages(next);
    if (nextPages !== null && (hifzTarget === "" || Number(hifzTarget) === 0)) setHifzTarget(String(nextPages));
  }

  async function save() {
    setError(null);
    const hifzN = Number(hifzTarget);
    const reviewN = Number(reviewTarget);
    if (!Number.isInteger(hifzN) || hifzN < 0 || hifzN > PLAN_MAX_TARGET) return setError(`مستهدف الحفظ من ٠ إلى ${PLAN_MAX_TARGET}`);
    if (!Number.isInteger(reviewN) || reviewN < 0 || reviewN > PLAN_MAX_TARGET) return setError(`مستهدف المراجعة من ٠ إلى ${PLAN_MAX_TARGET}`);
    if (rangeProblem) return setError(rangeProblem);

    setSaving(true);
    try {
      const res = await fetch("/api/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: row.studentId,
          month,
          hifzPagesTarget: hifzN,
          reviewPagesTarget: reviewN,
          hifz: rangeEmpty ? null : range,
          notes: notes.trim() === "" ? null : notes,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "تعذّر حفظ الخطة");
        return;
      }
      onSaved();
    } catch {
      setError("تعذّر حفظ الخطة");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`خطة ${row.name}`}>
      <div className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-naskh text-lg font-bold">خطة {row.name}</h2>
          <span className="text-xs text-muted-foreground">{monthLabel}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">مستهدف الحفظ (صفحات)</span>
            <input type="number" min={0} max={PLAN_MAX_TARGET} inputMode="numeric" value={hifzTarget} onChange={(e) => setHifzTarget(e.target.value)} className={FIELD} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">مستهدف المراجعة (صفحات)</span>
            <input type="number" min={0} max={PLAN_MAX_TARGET} inputMode="numeric" value={reviewTarget} onChange={(e) => setReviewTarget(e.target.value)} className={FIELD} />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">نطاق الحفظ المقرّر (اختياري)</legend>
          <AyahRangeInputs
            idPrefix={`plan-${row.studentId}`}
            value={range}
            onChange={changeRange}
            error={rangeProblem}
            pageLabel={pages !== null ? `${pages} صفحة` : null}
          />
          {!rangeEmpty && (
            <button type="button" onClick={() => setRange(EMPTY_RANGE)} className="cursor-pointer text-xs text-muted-foreground underline">
              مسح النطاق
            </button>
          )}
        </fieldset>

        <label className="block">
          <span className="text-xs text-muted-foreground">ملاحظة (اختياري)</span>
          <textarea value={notes} maxLength={PLAN_NOTES_MAX} rows={2} onChange={(e) => setNotes(e.target.value)} className={FIELD} />
        </label>

        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={save} disabled={saving || !!rangeProblem}>
            {saving ? "جارٍ الحفظ…" : "حفظ الخطة"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function PlansPage() {
  // null = الشهر الحالي (يحدّده الخادم)
  const [requested, setRequested] = useState<string | null>(null);
  const [data, setData] = useState<MonthData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const qs = requested ? `?month=${encodeURIComponent(requested)}` : "";
    fetch(`/api/plans${qs}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((d: MonthData) => {
        if (cancelled) return;
        setData(d);
        setFailed(null);
      })
      .catch(() => {
        if (!cancelled) setFailed(requested ?? "current");
      });
    return () => {
      cancelled = true;
    };
  }, [requested, reload]);

  const loading = failed === null && (data === null || (requested !== null && data.month !== requested));
  const refresh = useCallback(() => setReload((n) => n + 1), []);

  async function copyPrevious() {
    if (!data) return;
    setCopying(true);
    setNotice(null);
    try {
      const res = await fetch("/api/plans/copy-previous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: data.month }),
      });
      if (!res.ok) throw new Error("copy");
      const result = (await res.json()) as { copied: number };
      setNotice(result.copied > 0 ? `نُسخت ${result.copied} خطة من الشهر الماضي.` : "لا خطط جديدة للنسخ — كل الطلاب لديهم خطة أو لا توجد خطط في الشهر الماضي.");
      refresh();
    } catch {
      setNotice("تعذّر نسخ الخطط.");
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-naskh text-2xl font-bold">الخطة الشهرية</h1>
        <div className="flex items-center gap-2">
          <Button variant="ghost" aria-label="الشهر السابق" disabled={!data?.prevMonth} onClick={() => data?.prevMonth && setRequested(data.prevMonth)}>
            ‹
          </Button>
          <div className="min-w-32 text-center">
            <div className="font-semibold">{data?.monthLabel ?? "…"}</div>
            {data && <div className="tabular text-[11px] text-muted-foreground">{data.start} → {data.end}</div>}
          </div>
          <Button variant="ghost" aria-label="الشهر التالي" disabled={!data?.nextMonth} onClick={() => data?.nextMonth && setRequested(data.nextMonth)}>
            ›
          </Button>
          {data && data.month !== data.currentMonth && (
            <Button variant="ghost" onClick={() => setRequested(null)}>
              الشهر الحالي
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={copyPrevious} disabled={copying || !data || data.rows.length === 0}>
          {copying ? "جارٍ النسخ…" : "نسخ خطة الشهر الماضي للجميع"}
        </Button>
        <span className="text-xs text-muted-foreground">يملأ الطلاب بلا خطة فقط ولا يغيّر خطة قائمة.</span>
      </div>

      {notice && <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">{notice}</p>}

      {loading ? (
        <Empty title="جارٍ تحميل الخطط…" />
      ) : failed !== null && !data ? (
        <Empty title="تعذّر تحميل الخطط." />
      ) : !data || data.rows.length === 0 ? (
        <Empty title="لا طلاب فعّالون في الحلقة." />
      ) : (
        <ul className="space-y-2">
          {data.rows.map((row) => {
            const { plan, actual, progress } = row;
            const status = progress.status;
            return (
              <li key={row.studentId}>
                <Card className="space-y-2 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{row.name}</span>
                    <div className="flex items-center gap-2">
                      {status && (
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_STATUS_STYLE[status]}`}>
                          {PLAN_STATUS_LABEL[status]}
                        </span>
                      )}
                      <Button variant="ghost" onClick={() => setEditing(row)}>
                        {plan ? "تعديل الخطة" : "إضافة خطة"}
                      </Button>
                    </div>
                  </div>
                  {plan ? (
                    <>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="tabular text-muted-foreground">
                            الحفظ: {actual.hifzPages} / {plan.hifzPagesTarget}
                            {progress.hifzPct !== null ? ` · ${progress.hifzPct}٪` : ""}
                          </div>
                          <ProgressBar pct={progress.hifzPct} />
                        </div>
                        <div>
                          <div className="tabular text-muted-foreground">
                            المراجعة: {actual.reviewPages} / {plan.reviewPagesTarget}
                            {progress.reviewPct !== null ? ` · ${progress.reviewPct}٪` : ""}
                          </div>
                          <ProgressBar pct={progress.reviewPct} />
                        </div>
                      </div>
                      <div className="tabular text-[11px] text-muted-foreground">
                        المتوقَّع حتى اليوم {progress.expectedPct}٪
                        {plan.hifz ? ` · المقرّر: ${formatAyahRange(plan.hifz)}` : ""}
                      </div>
                      {plan.notes && <p className="text-xs text-muted-foreground">{plan.notes}</p>}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">لا خطة لهذا الشهر.</p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {editing && data && (
        <PlanEditor
          key={`${data.month}:${editing.studentId}`}
          row={editing}
          month={data.month}
          monthLabel={data.monthLabel}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
