import { PanelEmpty, type Tone } from "./panel";

export type Bar = { label: string; value: number; tone: Tone };

const W = 300;
const H = 170;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;
const PAD_X = 8;
const GRID_LINES = 4;

/** أعلى قيمة «لطيفة» للمحور بحيث تقع خطوط الشبكة على أرقام صحيحة */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  return Math.ceil(max / GRID_LINES) * GRID_LINES;
}

/** أعمدة SVG بقمم مستديرة وخطوط شبكة خفيفة وقيمة فوق كل عمود؛ الأول يبدأ من اليمين (RTL) */
export function BarChart({ bars, ariaLabel }: { bars: Bar[]; ariaLabel: string }) {
  const rawMax = Math.max(...bars.map((b) => b.value), 0);
  if (rawMax === 0) return <PanelEmpty />;

  const max = niceMax(rawMax);
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const slot = (W - PAD_X * 2) / bars.length;
  const barW = Math.min(36, slot * 0.55);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="h-auto w-full">
      {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
        const y = PAD_TOP + plotH - (plotH * i) / GRID_LINES;
        return (
          <line
            key={i}
            x1={PAD_X}
            x2={W - PAD_X}
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray={i === 0 ? undefined : "3 4"}
            className="text-border"
          />
        );
      })}
      {bars.map((b, i) => {
        const x = W - PAD_X - slot * (i + 1) + (slot - barW) / 2;
        const h = (b.value / max) * plotH;
        const y = PAD_TOP + plotH - h;
        const r = Math.min(7, barW / 2, h);
        return (
          <g key={b.label}>
            {h > 0 && (
              <path
                d={`M${x} ${y + h} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + barW - r} Q${x + barW} ${y} ${x + barW} ${y + r} V${y + h} Z`}
                fill="currentColor"
                className={b.tone.className}
                style={{ opacity: b.tone.opacity }}
              />
            )}
            <text
              x={x + barW / 2}
              y={y - 5}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="currentColor"
              className="tabular text-foreground"
            >
              {b.value}
            </text>
            <text
              x={x + barW / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
              className="text-muted-foreground"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
