"use client";

import { Empty } from "@/components/ui";
import type { MonthlySummary } from "@/lib/monthly-report";

/** اسم الشهر ميلادياً وهجرياً معاً — من منتصف الشهر (يوم ١٥) لتفادي أي التباس بحدود الشهر عبر المناطق الزمنية */
function monthLabel(year: number, month: number): { gregorian: string; hijri: string } {
  const mid = new Date(year, month - 1, 15);
  return {
    gregorian: new Intl.DateTimeFormat("ar", { month: "long", year: "numeric" }).format(mid),
    hijri: new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long", year: "numeric" }).format(mid),
  };
}

/** قسم "سجلّي الشهري" (STEP 53) — تجميع من /api/wards/monthly (كامل التاريخ، لا آخر ٣٠ ورداً فقط) */
export function MonthlyHistorySection({ months, loading }: { months: MonthlySummary[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-slate-400">جارٍ التحميل…</p>;
  if (months.length === 0) return <Empty title="لا يوجد سجلّ شهري بعد — أرسل ورداً ليبدأ حسابه." />;

  return (
    <ul className="space-y-2">
      {months.map((m, i) => {
        const { gregorian, hijri } = monthLabel(m.year, m.month);
        const prev = months[i + 1]; // الأقدم يلي الأحدث بالترتيب التنازلي
        const trend = prev ? (m.totalPages === prev.totalPages ? null : m.totalPages > prev.totalPages) : null;
        return (
          <li key={m.key} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <span className="text-sm font-bold text-slate-800">{gregorian}</span>
                <span className="mr-1.5 text-xs text-slate-400">· {hijri}</span>
              </div>
              {trend !== null && (
                <span
                  className={`tabular text-xs font-semibold ${trend ? "text-emerald-600" : "text-red-500"}`}
                  title={`مقارنة بشهر ${monthLabel(prev.year, prev.month).gregorian}`}
                >
                  {trend ? "↑" : "↓"} {Math.abs(m.totalPages - prev.totalPages)}
                </span>
              )}
            </div>
            <div className="tabular mt-2 grid grid-cols-4 gap-2 text-center">
              <div className="rounded-lg bg-emerald-50 px-1.5 py-1.5">
                <div className="text-sm font-bold text-emerald-700">{m.hifzPages}</div>
                <div className="text-[10px] text-emerald-600/80">صفحات حفظ</div>
              </div>
              <div className="rounded-lg bg-blue-50 px-1.5 py-1.5">
                <div className="text-sm font-bold text-blue-700">{m.reviewPages}</div>
                <div className="text-[10px] text-blue-600/80">صفحات مراجعة</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-1.5 py-1.5">
                <div className="text-sm font-bold text-slate-700">{m.activeDays}</div>
                <div className="text-[10px] text-slate-500">يوم نشط</div>
              </div>
              <div className="rounded-lg bg-slate-50 px-1.5 py-1.5">
                <div className="text-sm font-bold text-slate-700">
                  {m.approvedCount}/{m.wardCount}
                </div>
                <div className="text-[10px] text-slate-500">معتمد</div>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
