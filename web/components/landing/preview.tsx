import { Bar, Ticker } from "./client";

/*
  بطاقة معاينة المنتج في الهيرو — HTML/CSS حقيقي يحاكي لوحة الحلقة
  (لا صورة). أسماء الطلاب وهمية للعرض فقط.
*/

const ROWS = [
  { name: "يوسف الأحمد", note: "حفظ جديد — البقرة ٢٥٥–٢٦٠", state: "حاضر", tone: "ok" },
  { name: "عبدالله خالد", note: "مراجعة — جزء عمّ", state: "حاضر", tone: "ok" },
  { name: "سلمان ناصر", note: "الصغرى — آل عمران ١–٢٠", state: "بعذر", tone: "warn" },
] as const;

export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-lg">
      {/* توهّج خلف البطاقة */}
      <div aria-hidden className="absolute -inset-6 rounded-[2.5rem] bg-[#AD7D56]/25 blur-3xl" />

      <div className="lp-float relative rounded-[1.75rem] border border-white/15 bg-[#F3EDE6] p-4 text-black shadow-[0_40px_90px_-30px_rgba(173,125,86,0.55),inset_0_1px_0_rgba(255,255,255,0.7)] sm:p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-[#7F5636]">لوحة الحلقة</p>
            <p className="font-display text-xl leading-snug">حلقة عمر بن الخطاب</p>
          </div>
          <span className="rounded-full bg-black px-3 py-1 text-[11px] font-semibold text-[#CDB49E]">اليوم</span>
        </div>

        {/* التقدّم + الحضور — force-light تُبقيها بيضاء في الوضع الداكن */}
        <div className="force-light mt-4 grid grid-cols-[1fr_auto] items-center gap-4 rounded-2xl border border-[#E2D6C3] bg-white p-4">
          <div>
            <p className="text-xs font-semibold text-[#5F5344]">تقدّم حفظ الحلقة</p>
            <p className="mt-1 text-lg font-bold leading-tight">
              <Ticker to={18} /> من <span className="tabular">٣٠</span> جزء
            </p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#ECE2D2]" role="presentation">
              <Bar pct={60} className="bg-gradient-to-l from-[#AD7D56] to-[#7F5636]" />
            </div>
          </div>
          <div className="relative grid h-[84px] w-[84px] place-items-center">
            <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="#ECE2D2" strokeWidth="3.4" />
              <circle
                cx="18"
                cy="18"
                r="15.5"
                fill="none"
                stroke="#AD7D56"
                strokeWidth="3.4"
                strokeLinecap="round"
                strokeDasharray={`${0.92 * 97.4} 97.4`}
              />
            </svg>
            <div className="absolute text-center leading-none">
              <Ticker to={92} suffix="٪" className="text-lg font-bold" />
              <p className="mt-1 text-[10px] font-semibold text-[#5F5344]">الحضور</p>
            </div>
          </div>
        </div>

        {/* صفوف الطلاب */}
        <ul className="mt-3 space-y-2">
          {ROWS.map((r) => (
            <li key={r.name} className="flex items-center gap-3 rounded-xl border border-[#E2D6C3] bg-white/70 px-3 py-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-black text-sm font-bold text-[#CDB49E]">
                {r.name.charAt(0)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">{r.name}</span>
                <span className="block truncate text-[11px] text-[#5F5344]">{r.note}</span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  r.tone === "ok" ? "bg-[#E9EEE4] text-[#33573D]" : "bg-[#F0E4D2] text-[#7F5636]"
                }`}
              >
                {r.state}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* بطاقة الحديث */}
      <figure className="lp-float-slow relative z-10 -mt-2 ms-auto me-3 max-w-[18.5rem] rounded-2xl border border-black/10 bg-black p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] ring-1 ring-[#AD7D56]/40 sm:absolute sm:-bottom-16 sm:-left-8 sm:mt-0 sm:me-0 sm:ms-0">
        <blockquote className="font-naskh text-[17px] leading-[1.9] text-[#e9d9c6]">
          «خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ»
        </blockquote>
        <figcaption className="mt-1.5 text-[11px] font-semibold text-[#AD7D56]">رواه البخاري</figcaption>
      </figure>
    </div>
  );
}
