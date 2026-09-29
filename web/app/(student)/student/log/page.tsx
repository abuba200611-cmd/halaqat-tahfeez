"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Empty } from "@/components/ui";
import { AyahRangeField } from "@/components/ayah-range-field";
import { ReviewSegmentsField } from "@/components/review-segments-field";
import { WardListItem } from "@/components/ward-list";
import { useStudentWards } from "@/components/use-student-wards";
import { BookIcon, CalendarIcon } from "@/components/icons";
import { parseAyahRange, type AyahRangeInput } from "@/lib/ward-ayah";
import type { AyahRange, WardLog } from "@/lib/types";

const EMPTY_RANGE: AyahRangeInput = { from: { surah: null, ayah: null }, to: { surah: null, ayah: null } };

function isRangeTouched(v: AyahRangeInput): boolean {
  return v.from.surah != null || v.from.ayah != null || v.to.surah != null || v.to.ayah != null;
}

function ayahRangeToInput(range: AyahRange): AyahRangeInput {
  return {
    from: { surah: range.fromSurah, ayah: range.fromAyah },
    to: { surah: range.toSurah, ayah: range.toAyah },
  };
}

/** يحسب رسالة الخطأ الفورية ونص "≈ صفحة" لقسم الحفظ — يعيد استخدام parseAyahRange نفسها التي يستخدمها الخادم لاحقاً، فلا تتكرر قواعد التحقق بمكانين */
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

/**
 * يتحقّق من كل مقاطع المراجعة معاً (لحساب "≈ المجموع" وتعطيل الإرسال)،
 * ويرجع أيضاً رسالة خطأ لكل مقطع على حدة لعرضها تحت حقله مباشرة —
 * parseReviewSegments نفسها ترمي عند أول مقطع خاطئ فقط، فنعيد استدعاءها
 * تدريجياً (بادئة فمقطع فمقطع) لتحديد أي المقاطع بالضبط أخطأ الطالب فيها
 * كلّها دفعة واحدة، بدل إظهار خطأ واحد وإخفاء البقية.
 */
function describeReviewSegments(
  segments: AyahRangeInput[],
): { errors: (string | null)[]; pagesTotal: number | null; blocking: boolean } {
  const errors: (string | null)[] = segments.map(() => null);
  let pagesTotal = 0;
  let blocking = false;

  segments.forEach((segment, i) => {
    if (!isRangeTouched(segment)) {
      blocking = true;
      return;
    }
    try {
      const parsed = parseAyahRange(segment, "المراجعة");
      if (parsed) pagesTotal += parsed.pages.to - parsed.pages.from + 1;
    } catch (e) {
      errors[i] = e instanceof Error ? e.message : "قيمة غير صحيحة";
      blocking = true;
    }
  });

  return { errors, pagesTotal: segments.length > 0 ? pagesTotal : null, blocking };
}

export default function StudentLogPage() {
  const searchParams = useSearchParams();
  const editParam = searchParams.get("edit");
  const formRef = useRef<HTMLDivElement>(null);
  const { logs, loadingLogs, reload } = useStudentWards();

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [hifz, setHifz] = useState<AyahRangeInput>(EMPTY_RANGE);
  const [reviewSegments, setReviewSegments] = useState<AyahRangeInput[]>([]);
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function applyEditValues(log: WardLog) {
    setSent(false);
    setError(null);
    setEditingId(log.id);
    setEditingDate(log.date);
    setHifz(log.hifzAyah ? ayahRangeToInput(log.hifzAyah) : EMPTY_RANGE);
    if (log.reviewSegments && log.reviewSegments.length > 0) {
      setReviewSegments(log.reviewSegments.map(ayahRangeToInput));
    } else if (log.reviewAyah) {
      setReviewSegments([ayahRangeToInput(log.reviewAyah)]);
    } else {
      setReviewSegments([]);
    }
    setNote(log.note);
  }

  /** زرّ "تعديل" بقائمة الأوراد — استدعاء مباشر من معالج نقر، لا من أثر جانبي */
  function startEdit(log: WardLog) {
    applyEditValues(log);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /*
    فتح الصفحة برابط "?edit=المعرّف" (من الرئيسية أو "أورادي") يعبّئ
    النموذج تلقائياً بعد وصول الأوراد — نضبط الحالة أثناء العرض نفسه
    (نمط React الموصى به لمزامنة حالة محلية مع بيانات خارجية وصلت
    لاحقاً) لا بأثر جانبي، فلا ينشأ عنه استدعاء setState متزامن داخل
    useEffect. التمرير وحده يبقى بأثر جانبي منفصل (تأثير DOM حقيقي).
  */
  const [appliedEditParam, setAppliedEditParam] = useState<string | null>(null);
  if (!loadingLogs && editParam && appliedEditParam !== editParam) {
    setAppliedEditParam(editParam);
    const log = logs.find((l) => l.id === Number(editParam));
    if (log) applyEditValues(log);
  }
  useEffect(() => {
    if (appliedEditParam !== null && editingId !== null) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- مرّة واحدة فقط عند تطبيق تعديل قادم من رابط، لا عند كل تغيّر لاحق بـeditingId
  }, [appliedEditParam]);

  async function deleteLog(log: WardLog) {
    if (!confirm(`متأكد تحذف ورد يوم ${log.date}؟`)) return;
    try {
      const res = await fetch("/api/wards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: log.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "تعذّر حذف الورد");
        return;
      }
      if (editingId === log.id) resetForm();
      reload();
    } catch {
      alert("تعذّر الاتصال بالخادم");
    }
  }

  function resetForm() {
    setEditingId(null);
    setEditingDate(null);
    setHifz(EMPTY_RANGE);
    setReviewSegments([]);
    setNote("");
    setError(null);
  }

  const hifzInfo = useMemo(() => describeRange(hifz, "الحفظ"), [hifz]);
  const reviewInfo = useMemo(() => describeReviewSegments(reviewSegments), [reviewSegments]);
  const hasContent = isRangeTouched(hifz) || reviewSegments.length > 0 || note.trim().length > 0;
  const hasBlockingError = !!hifzInfo.error || reviewInfo.blocking;
  const submitDisabled = busy || !hasContent || hasBlockingError;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      const body: Record<string, unknown> = {
        hifz: isRangeTouched(hifz) ? hifz : null,
        review: reviewSegments.length > 0 ? reviewSegments : null,
        note: note.trim(),
      };
      const isEditing = editingId !== null;
      if (isEditing) {
        body.id = editingId;
        body.date = editingDate;
      }
      const res = await fetch("/api/wards", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? (isEditing ? "تعذّر حفظ التعديل" : "تعذّر إرسال الورد"));
        return;
      }
      setSent(true);
      resetForm();
      reload();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "tabular mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus-visible:border-blue-400 focus-visible:bg-white";

  const recent = logs.slice(0, 5);

  return (
    <div className="space-y-5">
      <div ref={formRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {editingId !== null && (
          <div className="mb-3 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            <span>تعديل ورد يوم {editingDate}</span>
            <button type="button" onClick={resetForm} className="cursor-pointer font-semibold underline hover:no-underline">
              إلغاء التعديل
            </button>
          </div>
        )}
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

          <ReviewSegmentsField
            label="المراجعة"
            icon={<CalendarIcon size={16} />}
            colorClass="text-blue-700"
            segments={reviewSegments}
            onChange={setReviewSegments}
            segmentErrors={reviewInfo.errors}
            pagesTotal={reviewInfo.pagesTotal}
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
          {sent && <p className="text-sm text-emerald-600">{editingId !== null ? "تم حفظ التعديل ✓" : "تم إرسال وردك إلى معلّمك ✓"}</p>}

          <button
            type="submit"
            disabled={submitDisabled}
            className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-sm transition-shadow duration-200 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #3B82F6, #1D4ED8)" }}
          >
            {busy ? "يُحفظ…" : editingId !== null ? "حفظ التعديل" : "أرسل وردي"}
          </button>
          {editingId === null && <p className="text-center text-xs text-slate-400">سجّل حفظاً أو مراجعة أو كليهما، ثم أرسل.</p>}
        </form>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">أورادي الأخيرة</h2>
        {loadingLogs ? (
          <p className="text-sm text-slate-400">جارٍ التحميل…</p>
        ) : recent.length === 0 ? (
          <Empty title="لم ترسل أي ورد بعد." />
        ) : (
          <ul className="space-y-2">
            {recent.map((log) => (
              <WardListItem key={log.id} log={log} onEdit={startEdit} onDelete={deleteLog} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
