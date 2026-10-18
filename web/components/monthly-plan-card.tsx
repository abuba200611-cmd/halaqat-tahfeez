import { formatAyahRange } from "@/lib/ward-ayah";
import { PLAN_STATUS_LABEL, type PlanStatus, type PlanView } from "@/lib/monthly-plan";

export const PLAN_STATUS_STYLE: Record<PlanStatus, string> = {
  ahead: "bg-success-soft text-success",
  on_track: "bg-success-soft text-success",
  behind: "bg-accent-soft text-accent-ink",
};

function Bar({ label, actual, target, pct }: { label: string; actual: number; target: number; pct: number | null }) {
  if (target <= 0) return null;
  const width = Math.min(100, pct ?? 0);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs text-stone-600">
        <span>{label}</span>
        <span className="tabular">
          {actual} من {target} صفحة · {pct ?? 0}٪
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-stone-100">
        <div className="h-full rounded-full bg-success" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

/** بطاقة "خطتي هذا الشهر" — للطالب وولي الأمر (قراءة فقط). لا تظهر لو لا خطة بمستهدف لهذا الشهر */
export function MonthlyPlanCard({ view, title = "خطتي هذا الشهر" }: { view: PlanView | null; title?: string }) {
  if (!view || !view.plan || !view.progress.status) return null;
  const { plan, actual, progress, monthLabel } = view;
  const status = progress.status as PlanStatus;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-stone-700">{title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_STATUS_STYLE[status]}`}>
          {PLAN_STATUS_LABEL[status]}
        </span>
      </div>
      <p className="mb-3 text-xs text-stone-500">{monthLabel}</p>
      <div className="space-y-3">
        <Bar label="الحفظ" actual={actual.hifzPages} target={plan.hifzPagesTarget} pct={progress.hifzPct} />
        <Bar label="المراجعة" actual={actual.reviewPages} target={plan.reviewPagesTarget} pct={progress.reviewPct} />
      </div>
      {plan.hifz && <p className="mt-3 text-xs text-stone-500">المقرّر: {formatAyahRange(plan.hifz)}</p>}
      {plan.notes && <p className="mt-1 text-xs text-stone-500">ملاحظة المعلّم: {plan.notes}</p>}
    </div>
  );
}
