import { Dot, PanelEmpty, type Tone } from "./panel";

export type DonutSlice = { label: string; value: number; pct: number; tone: Tone };

const R = 42;
const C = 2 * Math.PI * R;

/** دونات SVG بسيطة: الإجمالي في المنتصف وقائمة مفتاح (نقطة، وصف، عدد ونسبة) */
export function Donut({
  slices,
  total,
  centerLabel,
  ariaLabel,
}: {
  slices: DonutSlice[];
  total: number;
  centerLabel: string;
  ariaLabel: string;
}) {
  if (total === 0) return <PanelEmpty />;

  const visible = slices.filter((s) => s.value > 0);
  const arcs = visible.map((s, i) => ({
    slice: s,
    len: (s.value / total) * C,
    // بداية القوس = مجموع أطوال الأقواس السابقة
    offset: visible.slice(0, i).reduce((sum, p) => sum + (p.value / total) * C, 0),
  }));

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-6 lg:flex-col xl:flex-row">
      <div className="relative h-36 w-36 shrink-0">
        <svg viewBox="0 0 100 100" role="img" aria-label={ariaLabel} className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeWidth="11" className="text-muted" />
          {arcs.map(({ slice, len, offset: off }) => (
            <circle
              key={slice.label}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke="currentColor"
              strokeWidth="11"
              strokeDasharray={`${Math.max(len - (arcs.length > 1 ? 1.5 : 0), 0.01)} ${C}`}
              strokeDashoffset={-off}
              className={slice.tone.className}
              style={{ opacity: slice.tone.opacity }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold text-foreground">{total}</span>
          <span className="text-xs text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <Dot tone={s.tone} />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{s.label}</span>
            <span className="tabular font-medium text-foreground">{s.value}</span>
            <span className="tabular w-10 text-end text-xs text-muted-foreground">{s.pct}٪</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
