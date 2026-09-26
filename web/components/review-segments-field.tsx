"use client";

import { AyahRangeInputs } from "./ayah-range-field";
import { CloseIcon, PlusIcon } from "./icons";
import { MAX_REVIEW_SEGMENTS, type AyahRangeInput } from "@/lib/ward-ayah";

const EMPTY_SEGMENT: AyahRangeInput = { from: { surah: null, ayah: null }, to: { surah: null, ayah: null } };

export { EMPTY_SEGMENT };

/**
 * قائمة مقاطع المراجعة (STEP 52) — كل مقطع نطاق سورة/آية مستقل بنفس
 * مكوّن STEP 49 (AyahRangeInputs)، مع زر "+ أضف مقطع" (حتى ١٠) وزر
 * حذف لكل مقطع. رسالة الخطأ لكل مقطع تصل جاهزة من الأب (محسوبة عبر
 * lib/ward-ayah.ts: parseReviewSegments، فلا تتكرر قواعد التحقّق هنا).
 */
export function ReviewSegmentsField({
  label,
  icon,
  colorClass,
  segments,
  onChange,
  segmentErrors,
  pagesTotal,
}: {
  label: string;
  icon: React.ReactNode;
  colorClass: string;
  segments: AyahRangeInput[];
  onChange: (next: AyahRangeInput[]) => void;
  /** رسالة خطأ لكل مقطع بنفس الفهرس، أو null لو المقطع صحيح/فارغ بعد */
  segmentErrors: (string | null)[];
  pagesTotal: number | null;
}) {
  function updateSegment(index: number, next: AyahRangeInput) {
    onChange(segments.map((s, i) => (i === index ? next : s)));
  }

  function removeSegment(index: number) {
    onChange(segments.filter((_, i) => i !== index));
  }

  function addSegment() {
    if (segments.length >= MAX_REVIEW_SEGMENTS) return;
    onChange([...segments, EMPTY_SEGMENT]);
  }

  return (
    <fieldset className="space-y-3">
      <legend className={`flex items-center gap-1.5 text-sm font-semibold ${colorClass}`}>
        {icon}
        {label}
      </legend>

      {segments.length === 0 && (
        <p className="text-xs text-slate-400">لا مراجعة اليوم — اضغط «أضف مقطع مراجعة» لو راجعت.</p>
      )}

      <div className="space-y-3">
        {segments.map((segment, i) => (
          <div key={i} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">مقطع {i + 1}</span>
              <button
                type="button"
                onClick={() => removeSegment(i)}
                className="cursor-pointer rounded-md p-1 text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600"
                aria-label={`حذف مقطع ${i + 1}`}
              >
                <CloseIcon size={16} />
              </button>
            </div>
            <AyahRangeInputs
              idPrefix={`review-seg-${i}`}
              value={segment}
              onChange={(next) => updateSegment(i, next)}
              error={segmentErrors[i] ?? null}
              pageLabel={null}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addSegment}
        disabled={segments.length >= MAX_REVIEW_SEGMENTS}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-medium text-slate-500 transition-colors duration-200 hover:border-blue-300 hover:bg-blue-50/50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PlusIcon size={16} />
        أضف مقطع مراجعة {segments.length > 0 && `(${segments.length}/${MAX_REVIEW_SEGMENTS})`}
      </button>

      {pagesTotal !== null && pagesTotal > 0 && (
        <p className="tabular text-xs text-slate-400">≈ {pagesTotal} صفحة إجمالاً</p>
      )}
    </fieldset>
  );
}
