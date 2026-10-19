"use client";

import { JUZ_CELL_LABEL, formatJuzFraction, type JuzProgress } from "@/lib/juz-progress";
import { TOTAL_JUZ, TOTAL_PAGES } from "@/lib/quran";

/** لون خلية الجزء بمفاتيح الهوية فقط — محفوظ أسود، جزئي بيج، لم يبدأ محايد */
const CELL_CLASS: Record<JuzProgress["cells"][number], string> = {
  memorized: "bg-primary text-on-primary",
  partial: "bg-secondary text-on-secondary",
  not_started: "border border-border bg-surface text-muted-foreground",
};

const LEGEND_DOT: Record<JuzProgress["cells"][number], string> = {
  memorized: "bg-primary",
  partial: "bg-secondary",
  not_started: "border border-border bg-surface",
};

/**
 * B3 — بطاقة تقدّم الحفظ بالأجزاء: شريط «X من 30 جزء» + شبكة ٣٠ خلية
 * (محفوظ/جزئي/لم يبدأ). مشتركة بين لوحة الطالب ولوحة ولي الأمر وصفحة
 * الطالب عند المعلّم — نفس الحساب (اتحاد نطاقات الحفظ) في الثلاثة.
 */
export function JuzProgressCard({ progress, footer }: { progress: JuzProgress; footer?: React.ReactNode }) {
  const pct = Math.min(100, (progress.pagesMemorized / TOTAL_PAGES) * 100);

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">تقدّم الأجزاء</h2>
        <span className="tabular text-xs text-muted-foreground">
          {formatJuzFraction(progress.juzFraction)} من {TOTAL_JUZ} جزء · {progress.pagesMemorized} من {TOTAL_PAGES}{" "}
          صفحة
        </span>
      </div>

      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={progress.pagesMemorized} aria-valuemin={0} aria-valuemax={TOTAL_PAGES} aria-label="تقدّم الحفظ بالصفحات">
        <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 grid grid-cols-10 gap-1" dir="rtl" role="img" aria-label="شبكة الأجزاء الثلاثين">
        {progress.cells.map((cell, i) => (
          <span
            key={i}
            title={`جزء ${i + 1}: ${JUZ_CELL_LABEL[cell]}`}
            aria-label={`جزء ${i + 1}: ${JUZ_CELL_LABEL[cell]}`}
            className={`tabular flex aspect-square items-center justify-center rounded text-[10px] leading-none ${CELL_CLASS[cell]}`}
          >
            {i + 1}
          </span>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(Object.keys(JUZ_CELL_LABEL) as (keyof typeof JUZ_CELL_LABEL)[]).map((status) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`inline-block size-2.5 rounded-sm ${LEGEND_DOT[status]}`} aria-hidden />
            {JUZ_CELL_LABEL[status]}
          </span>
        ))}
      </div>

      {footer && <div className="mt-1.5 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}
