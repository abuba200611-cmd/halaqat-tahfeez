"use client";

import { REVIEW_TRACK_LABEL, type ReviewTrackCounts } from "@/lib/review-tracks";
import type { ReviewTrack } from "@/lib/types";

/**
 * B3 — عدّادات المراجعة لكل مسار (الكبرى/الصغرى) لآخر ٧ و٣٠ يوماً،
 * بالصفحات. الحفظ الجديد ليس هنا — له قسم الحفظ في الورد نفسه. ما صُنِّف
 * بلا مسار يظهر كـ«بلا تصنيف» ولا يُخفى، حتى يظهر أثر التصنيف الناقص.
 * labels بتسمية الجامع (reviewTrackLabels) — وميزة التصنيف معطّلة عند
 * الأصل فلا تُعرض البطاقة أصلاً.
 */
export function ReviewTrackCountsCard({
  days7,
  days30,
  labels = REVIEW_TRACK_LABEL,
}: {
  days7: ReviewTrackCounts;
  days30: ReviewTrackCounts;
  labels?: Record<ReviewTrack, string>;
}) {
  const total = days30.sabqi + days30.manzil + days30.untagged;
  if (total === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="mb-2 text-sm font-semibold text-foreground">مراجعاتي بالمسار</h2>
      <div className="grid grid-cols-2 gap-2.5">
        {(
          [
            ["آخر ٧ أيام", days7],
            ["آخر ٣٠ يوماً", days30],
          ] as const
        ).map(([label, counts]) => (
          <div key={label} className="rounded-xl bg-accent-soft/60 p-3">
            <p className="mb-1.5 text-[11px] font-semibold text-accent-ink">{label}</p>
            <ul className="space-y-1 text-xs">
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">{labels.sabqi}</span>
                <span className="tabular font-semibold text-foreground">{counts.sabqi} ص</span>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-muted-foreground">{labels.manzil}</span>
                <span className="tabular font-semibold text-foreground">{counts.manzil} ص</span>
              </li>
              {counts.untagged > 0 && (
                <li className="flex items-center justify-between">
                  <span className="text-muted-foreground">بلا تصنيف</span>
                  <span className="tabular font-semibold text-muted-foreground">{counts.untagged} ص</span>
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * منتقي مسار مقطع مراجعة واحد — الكبرى/الصغرى أو بلا تصنيف. مشترك بين
 * نموذج الطالب (مع قيمة مقترحة) وتصحيح المعلّم بالوارد. labels بتسمية
 * الجامع (reviewTrackLabels) والافتراضي القياسي.
 */
export function ReviewTrackSelect({
  id,
  value,
  onChange,
  disabled = false,
  labels = REVIEW_TRACK_LABEL,
}: {
  id: string;
  value: ReviewTrack | null;
  onChange: (next: ReviewTrack | null) => void;
  disabled?: boolean;
  labels?: Record<ReviewTrack, string>;
}) {
  return (
    <select
      id={id}
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "sabqi" || e.target.value === "manzil" ? e.target.value : null)}
      className="tabular cursor-pointer rounded-lg border border-border bg-surface px-2 py-1 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
      aria-label="مسار المراجعة"
    >
      <option value="">بلا تصنيف</option>
      <option value="sabqi">{labels.sabqi}</option>
      <option value="manzil">{labels.manzil}</option>
    </select>
  );
}
