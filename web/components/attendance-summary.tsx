import type { AttendanceSummary } from "@/lib/attendance";

/** بطاقة صغيرة لحضور آخر ٣٠ يوماً — تُستخدم عند الطالب وولي الأمر (قراءة فقط) */
export function AttendanceSummaryCard({ summary }: { summary: AttendanceSummary | null }) {
  if (!summary || summary.days === 0) return null;
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-stone-700">الحضور — آخر ٣٠ يوماً</h2>
        <span className="tabular text-xs text-stone-500">{summary.days} يوم محسوب</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="tabular text-xl font-bold text-success">{summary.presentPct}٪</div>
          <div className="text-[11px] text-stone-500">نسبة الحضور</div>
        </div>
        <div>
          <div className="tabular text-xl font-bold text-destructive">{summary.absent}</div>
          <div className="text-[11px] text-stone-500">غياب</div>
        </div>
        <div>
          <div className="tabular text-xl font-bold text-accent-ink">{summary.late}</div>
          <div className="text-[11px] text-stone-500">تأخر</div>
        </div>
      </div>
    </div>
  );
}
