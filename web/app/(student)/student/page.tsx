"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty } from "@/components/ui";
import { IslamicPattern } from "@/app/(teacher)/page";
import { BookIcon, CalendarIcon } from "@/components/icons";
import { useStudentSession } from "@/components/student-gate";
import { juzLabel, juzesOfRange } from "@/lib/quran";
import type { PageRange, WardLog, WardStatus } from "@/lib/types";

const STATUS_LABEL: Record<WardStatus, string> = {
  new: "بانتظار الاطّلاع",
  seen: "اطّلع المعلّم",
  approved: "معتمد",
  needs_revision: "يحتاج إعادة",
};

const STATUS_STYLE: Record<WardStatus, string> = {
  new: "bg-amber-50 text-amber-700",
  seen: "bg-slate-100 text-slate-600",
  approved: "bg-emerald-50 text-emerald-600",
  needs_revision: "bg-red-50 text-red-600",
};

function statusTone(status: WardStatus): string {
  return STATUS_STYLE[status];
}

function rangeText(range: PageRange | null): string | null {
  if (!range) return null;
  const juz = juzLabel(juzesOfRange(range.from, range.to));
  return `صفحة ${range.from} إلى ${range.to} · ${juz}`;
}

/** أيام متتالية بها ورد مُرسل، عدّاً تنازلياً من آخر تاريخ إرسال — بيانات حقيقية من logs فقط */
function computeStreak(dates: string[]): number {
  const uniqueSorted = [...new Set(dates)].sort().reverse();
  if (uniqueSorted.length === 0) return 0;
  let streak = 1;
  for (let i = 0; i < uniqueSorted.length - 1; i++) {
    const cur = new Date(uniqueSorted[i]);
    const next = new Date(uniqueSorted[i + 1]);
    const diffDays = Math.round((cur.getTime() - next.getTime()) / 86400000);
    if (diffDays === 1) streak++;
    else break;
  }
  return streak;
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

  const stats = useMemo(() => {
    const approved = logs.filter((l) => l.status === "approved").length;
    const streak = computeStreak(logs.map((l) => l.date));
    return { total: logs.length, approved, streak };
  }, [logs]);

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
    "tabular mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus-visible:border-blue-400 focus-visible:bg-white";

  const gregorian = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", weekday: "long" }).format(new Date());

  return (
    <div className="space-y-5">
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white"
        style={{ background: "linear-gradient(135deg, #1E3A8A, #2563EB)" }}
      >
        <IslamicPattern />
        <div className="relative">
          <h1 className="font-naskh text-xl font-bold">
            {student ? `حيّاك الله يا ${student.name}` : "ورد اليوم"}
          </h1>
          <p className="mt-1 text-xs text-white/80">
            {gregorian}
            {student?.halaqahName ? ` · ${student.halaqahName}` : ""}
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
              <div className="tabular text-lg font-bold">{stats.total}</div>
              <div className="mt-0.5 text-[11px] text-white/75">إجمالي الأوراد</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
              <div className="tabular text-lg font-bold">{stats.approved}</div>
              <div className="mt-0.5 text-[11px] text-white/75">معتمد</div>
            </div>
            <div className="rounded-xl bg-white/10 px-3 py-2.5 text-center backdrop-blur-sm">
              <div className="tabular text-lg font-bold">{stats.streak}</div>
              <div className="mt-0.5 text-[11px] text-white/75">أيام متتالية</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={submit} className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
              <BookIcon size={16} />
              الحفظ الجديد
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-slate-500">من صفحة</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  inputMode="numeric"
                  value={hifzFrom}
                  onChange={(e) => setHifzFrom(e.target.value)}
                  className={field}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">إلى صفحة</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  inputMode="numeric"
                  value={hifzTo}
                  onChange={(e) => setHifzTo(e.target.value)}
                  className={field}
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="flex items-center gap-1.5 text-sm font-semibold text-blue-700">
              <CalendarIcon size={16} />
              المراجعة
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-slate-500">من صفحة</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  inputMode="numeric"
                  value={reviewFrom}
                  onChange={(e) => setReviewFrom(e.target.value)}
                  className={field}
                />
              </label>
              <label className="block">
                <span className="text-xs text-slate-500">إلى صفحة</span>
                <input
                  type="number"
                  min={1}
                  max={604}
                  inputMode="numeric"
                  value={reviewTo}
                  onChange={(e) => setReviewTo(e.target.value)}
                  className={field}
                />
              </label>
            </div>
          </fieldset>

          <label className="block">
            <span className="text-xs text-slate-500">ملاحظة (اختياري)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="مثال: تعثّرت في آخر صفحة"
              className={field}
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {sent && <p className="text-sm text-emerald-600">تم إرسال وردك إلى معلّمك ✓</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-sm transition-shadow duration-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #3B82F6, #1D4ED8)" }}
          >
            {busy ? "يُرسل…" : "أرسل وردي"}
          </button>
          <p className="text-center text-xs text-slate-400">سجّل حفظاً أو مراجعة أو كليهما، ثم أرسل.</p>
        </form>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">أورادي الأخيرة</h2>
        {loadingLogs ? (
          <p className="text-sm text-slate-400">جارٍ التحميل…</p>
        ) : logs.length === 0 ? (
          <Empty title="لم ترسل أي ورد بعد." />
        ) : (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li key={log.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-baseline justify-between">
                  <span className="tabular text-sm font-medium text-slate-800">{log.date}</span>
                  <span className={`tabular rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(log.status)}`}>
                    {STATUS_LABEL[log.status]}
                  </span>
                </div>

                {log.previousAttemptId && (
                  <p className="mt-1 text-xs text-slate-400">↩ محاولة جديدة عن ورد سابق</p>
                )}

                <div className="mt-1 space-y-0.5 text-sm text-slate-500">
                  {rangeText(log.hifz) && <p>حفظ: {rangeText(log.hifz)}</p>}
                  {rangeText(log.review) && <p>مراجعة: {rangeText(log.review)}</p>}
                  {log.note && <p className="text-slate-700">{log.note}</p>}
                </div>

                {log.status === "needs_revision" && (
                  <div className="mt-2 space-y-1 rounded-xl border border-red-100 bg-red-50/60 p-2">
                    {log.reviewNote && (
                      <p className="text-sm text-red-700">ملاحظة معلّمك: «{log.reviewNote}»</p>
                    )}
                    <p className="text-xs text-slate-500">
                      أرسل محاولة جديدة من النموذج أعلاه — هذه المحاولة لا يمكن تعديلها.
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
