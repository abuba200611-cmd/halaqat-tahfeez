import type { AttendanceSummary } from "@/lib/attendance";

/** بطاقة صغيرة لحضور آخر ٣٠ يوماً — تُستخدم عند الطالب وولي الأمر (قراءة فقط) */
export function AttendanceSummaryCard({ summary }: { summary: AttendanceSummary | null }) {
  if (!summary || summary.days === 0) return null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">الحضور — آخر ٣٠ يوماً</h2>
        <span className="tabular text-xs text-slate-500">{summary.days} يوم محسوب</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="tabular text-xl font-bold text-emerald-700">{summary.presentPct}٪</div>
          <div className="text-[11px] text-slate-500">نسبة الحضور</div>
        </div>
        <div>
          <div className="tabular text-xl font-bold text-red-600">{summary.absent}</div>
          <div className="text-[11px] text-slate-500">غياب</div>
        </div>
        <div>
          <div className="tabular text-xl font-bold text-amber-600">{summary.late}</div>
          <div className="text-[11px] text-slate-500">تأخر</div>
        </div>
      </div>
    </div>
  );
}
