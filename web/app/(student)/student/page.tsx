"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Empty } from "@/components/ui";
import { IslamicPattern } from "@/app/(teacher)/page";
import { AyahRangeField } from "@/components/ayah-range-field";
import { BookIcon, CalendarIcon } from "@/components/icons";
import { useStudentSession } from "@/components/student-gate";
import { juzLabel, juzesOfRange } from "@/lib/quran";
import { formatAyahRange, parseAyahRange, type AyahRangeInput } from "@/lib/ward-ayah";
import type { AyahRange, PageRange, WardLog, WardStatus } from "@/lib/types";

const EMPTY_RANGE: AyahRangeInput = { from: { surah: null, ayah: null }, to: { surah: null, ayah: null } };

function isRangeTouched(v: AyahRangeInput): boolean {
  return v.from.surah != null || v.from.ayah != null || v.to.surah != null || v.to.ayah != null;
}

/** يحسب رسالة الخطأ الفورية ونص "≈ صفحة" لقسم واحد — يعيد استخدام parseAyahRange نفسها التي يستخدمها الخادم لاحقاً، فلا تتكرر قواعد التحقق بمكانين */
function describeRange(value: AyahRangeInput, label: string): { error: string | null; pageLabel: string | null } {
  const touched = isRangeTouched(value);
  try {
    const parsed = parseAyahRange(value, label);
    if (!parsed) return { error: null, pageLabel: null };
    const { from, to } = parsed.pages;
    return { error: null, pageLabel: from === to ? `≈ صفحة ${from}` : `≈ صفحة ${from}–${to}` };
  } catch (e) {
    if (!touched) return { error: null, pageLabel: null };
    return { error: e instanceof Error ? e.message : "قيمة غير صحيحة", pageLabel: null };
  }
}

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

/** الأوراد الجديدة (STEP 49) تعرض السورة/الآية؛ القديمة (بلا سورة محفوظة) تظل تُعرض بالصفحات كما كانت دائماً */
function rangeText(range: PageRange | null, ayahRange: AyahRange | null): string | null {
  if (ayahRange) return formatAyahRange(ayahRange);
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
  const [hifz, setHifz] = useState<AyahRangeInput>(EMPTY_RANGE);
  const [review, setReview] = useState<AyahRangeInput>(EMPTY_RANGE);
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

  const hifzInfo = useMemo(() => describeRange(hifz, "الحفظ"), [hifz]);
  const reviewInfo = useMemo(() => describeRange(review, "المراجعة"), [review]);
  const hasContent = isRangeTouched(hifz) || isRangeTouched(review) || note.trim().length > 0;
  const hasBlockingError = !!hifzInfo.error || !!reviewInfo.error;
  const submitDisabled = busy || !hasContent || hasBlockingError;

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
          hifz: isRangeTouched(hifz) ? hifz : null,
          review: isRangeTouched(review) ? review : null,
          note: note.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إرسال الورد");
        return;
      }
      setSent(true);
      setHifz(EMPTY_RANGE);
      setReview(EMPTY_RANGE);
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
          <AyahRangeField
            idPrefix="hifz"
            label="الحفظ الجديد"
            icon={<BookIcon size={16} />}
            colorClass="text-emerald-700"
            value={hifz}
            onChange={setHifz}
            error={hifzInfo.error}
            pageLabel={hifzInfo.pageLabel}
          />

          <AyahRangeField
            idPrefix="review"
            label="المراجعة"
            icon={<CalendarIcon size={16} />}
            colorClass="text-blue-700"
            value={review}
            onChange={setReview}
            error={reviewInfo.error}
            pageLabel={reviewInfo.pageLabel}
          />

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
            disabled={submitDisabled}
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
                  {rangeText(log.hifz, log.hifzAyah) && <p>حفظ: {rangeText(log.hifz, log.hifzAyah)}</p>}
                  {rangeText(log.review, log.reviewAyah) && <p>مراجعة: {rangeText(log.review, log.reviewAyah)}</p>}
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
