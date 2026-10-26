"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { ReviewSegmentsField } from "@/components/review-segments-field";
import { BookIcon, CalendarIcon } from "@/components/icons";
import { allSurahs, surahAyahCount } from "@/lib/quran-surahs";
import { parseAyahRange, parseReviewSegments, type AyahRangeInput } from "@/lib/ward-ayah";

/*
  نموذج تسجيل المعلّم للورد عن طالب الابتدائي (001 T026، FR-004): مبسّط
  بأزرار كبيرة من الجوال أولاً — سورة (القصيرة أولاً) + «سورة كاملة» أو
  من آية إلى آية، ومراجعة وملاحظة اختياريتان، وتحذير التكرار بزرين.
*/

/** السور بالقصيرة أولاً (١١٤→١) — أهلها هم مستخدمو هذا النموذج */
const SURAHS_SHORT_FIRST = [...allSurahs()].reverse();

const FIELD =
  "tabular mt-1 w-full rounded-xl border border-border bg-surface px-3 py-3 text-base text-foreground outline-none transition-colors duration-200 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function surahOptionText(number: number): string {
  return `${number}. ${SURAHS_SHORT_FIRST.find((s) => s.number === number)!.name}`;
}

/** يستخرج رقم السورة من نص الخيار ("١١٢. الإخلاص") — أو null لو ما طابق خياراً */
function parseSurahText(text: string): number | null {
  const match = text.trim().match(/^(\d{1,3})\s*\./);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 114 ? n : null;
}

export type TeacherWardFormProps = {
  student: { id: string; name: string };
  /** يُستدعى بعد نجاح الحفظ — ينتقل المستدعي للتالي أو لإغلاق النموذج */
  onSaved: (nextStudentId: string | null) => void;
};

export function TeacherWardForm({ student, onSaved }: TeacherWardFormProps) {
  const [surah, setSurah] = useState<number | null>(null);
  const [surahText, setSurahText] = useState("");
  const [wholeSurah, setWholeSurah] = useState(false);
  const [fromAyah, setFromAyah] = useState("");
  const [toAyah, setToAyah] = useState("");
  const [reviewSegments, setReviewSegments] = useState<AyahRangeInput[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** تحذير التكرار (409 DUPLICATE_TODAY): ملخّص الورد القائم حتى يقرّر المعلّم */
  const [duplicate, setDuplicate] = useState<{ summary: string } | null>(null);

  const maxAyah = useMemo(() => (surah ? surahAyahCount(surah) : null), [surah]);

  const rangeError = useMemo(() => {
    if (wholeSurah || !surah) return null;
    if (!fromAyah && !toAyah) return null;
    try {
      parseAyahRange(
        {
          from: { surah, ayah: fromAyah ? Number(fromAyah) : null },
          to: { surah, ayah: toAyah ? Number(toAyah) : null },
        },
        "الحفظ",
      );
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "قيمة غير صحيحة";
    }
  }, [wholeSurah, surah, fromAyah, toAyah]);

  const reviewError = useMemo(() => {
    if (reviewSegments.length === 0) return null;
    try {
      parseReviewSegments(reviewSegments);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "قيمة غير صحيحة";
    }
  }, [reviewSegments]);

  const hasContent = surah !== null || reviewSegments.length > 0 || note.trim().length > 0;
  const disabled = busy || !hasContent || !!rangeError || !!reviewError;

  async function submit(confirmDuplicate: boolean) {
    if (!hasContent) return;
    setBusy(true);
    setError(null);
    setDuplicate(null);
    try {
      const res = await fetch("/api/teacher/wards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          // «سورة كاملة» تُحوَّل خادمياً إلى ١ → آخر آية؛ وإلا نطاق من/إلى
          ...(surah !== null && (wholeSurah || (fromAyah && toAyah))
            ? wholeSurah
              ? { wholeSurah: surah }
              : {
                  hifz: {
                    from: { surah, ayah: Number(fromAyah) },
                    to: { surah, ayah: Number(toAyah) },
                  },
                }
            : {}),
          review: reviewSegments.length > 0 ? reviewSegments : null,
          note: note.trim(),
          confirmDuplicate,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        nextStudentId?: string | null;
        code?: string;
        existing?: { summary?: string };
        error?: string;
      };
      if (res.status === 409 && data.code === "DUPLICATE_TODAY") {
        setDuplicate({ summary: data.existing?.summary ?? "" });
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "تعذّر تسجيل الورد");
        return;
      }
      onSaved(data.nextStudentId ?? null);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      className="space-y-4"
    >
      <fieldset className="space-y-2">
        <legend className="flex items-center gap-1.5 text-sm font-semibold text-success">
          <BookIcon size={16} />
          الحفظ — لـ{student.name}
        </legend>

        {/* اختيار السورة بالقصيرة أولاً مع بحث — نمط combobox الحقول القائمة */}
        <label className="block">
          <span className="text-xs text-muted-foreground">السورة</span>
          <input
            list="teacher-ward-surahs"
            value={surahText}
            onChange={(e) => {
              setSurahText(e.target.value);
              const n = parseSurahText(e.target.value);
              setSurah(n);
              if (n) {
                setFromAyah("1");
                setToAyah(String(surahAyahCount(n)));
              }
            }}
            placeholder="ابحث باسم السورة (القصيرة أولاً)"
            autoComplete="off"
            className={FIELD}
          />
          <datalist id="teacher-ward-surahs">
            {SURAHS_SHORT_FIRST.map((s) => (
              <option key={s.number} value={surahOptionText(s.number)} />
            ))}
          </datalist>
        </label>

        {/* «سورة كاملة»: بضغطة واحدة — يخفي حقلي الآيات */}
        <button
          type="button"
          role="switch"
          aria-checked={wholeSurah}
          disabled={!surah}
          onClick={() => {
            const next = !wholeSurah;
            setWholeSurah(next);
            if (next && surah) {
              setFromAyah("1");
              setToAyah(String(surahAyahCount(surah)));
            }
          }}
          className={`flex w-full cursor-pointer items-center justify-between rounded-xl border px-4 py-3.5 text-base font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${
            wholeSurah ? "border-accent bg-accent-soft text-accent-ink" : "border-border bg-surface text-foreground"
          }`}
        >
          <span>سورة كاملة</span>
          <span className="text-sm text-muted-foreground">{wholeSurah ? "مفعّل ✓" : "أو حدّد الآيات"}</span>
        </button>

        {!wholeSurah && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">من آية</span>
              <input
                type="number"
                min={1}
                max={maxAyah ?? undefined}
                inputMode="numeric"
                disabled={!surah}
                value={fromAyah}
                onChange={(e) => setFromAyah(e.target.value)}
                className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">إلى آية</span>
              <input
                type="number"
                min={1}
                max={maxAyah ?? undefined}
                inputMode="numeric"
                disabled={!surah}
                value={toAyah}
                onChange={(e) => setToAyah(e.target.value)}
                className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
              />
            </label>
          </div>
        )}
        {wholeSurah && surah && (
          <p className="tabular text-xs text-muted-foreground">من الآية ١ إلى الآية {surahAyahCount(surah)}</p>
        )}
        {rangeError && <p className="text-xs text-destructive">{rangeError}</p>}
      </fieldset>

      <ReviewSegmentsField
        label="المراجعة (اختياري)"
        icon={<CalendarIcon size={16} />}
        colorClass="text-accent-ink"
        segments={reviewSegments}
        onChange={setReviewSegments}
        segmentErrors={reviewSegments.map(() => null)}
        pagesTotal={null}
      />

      <label className="block">
        <span className="text-xs text-muted-foreground">ملاحظة (اختياري)</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="مثال: ما شاء الله، أتقن كامل السورة"
          className={FIELD}
        />
      </label>

      {/* TODO 001/US5 (T026): زر «متقن» يُضاف هنا عند تفعيل النقاط (M2/T043) —
          يمنح بونس الإتقان (mastered) عند اعتماد الورد. */}

      {duplicate && (
        <div role="alert" className="space-y-2 rounded-xl border border-accent bg-accent-soft p-3.5">
          <p className="text-sm font-semibold text-accent-ink">
            سُجِّل ورد لـ{student.name} في هذا اليوم بالفعل{duplicate.summary ? `: ${duplicate.summary}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">هل تريد تسجيل ورد إضافي مع ذلك؟</p>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => submit(true)} disabled={busy} className="flex-1 py-2.5">
              {busy ? "لحظة…" : "نعم، سجّل مع ذلك"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDuplicate(null)} disabled={busy} className="flex-1 py-2.5">
              رجوع
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={disabled}
        className="w-full cursor-pointer rounded-xl bg-primary px-3 py-4 text-base font-bold text-on-primary shadow-sm transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "يُحفظ…" : "اعتماد الورد"}
      </button>
      <p className="text-center text-xs text-muted-foreground">يُحفظ الورد معتمداً باسمك فوراً.</p>
    </form>
  );
}
