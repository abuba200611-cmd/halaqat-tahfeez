import type { CSSProperties } from "react";
import { PanelEmpty, TONES } from "./panel";
import { dayMonthLabel, type DailyPoint } from "@/lib/chart-series";

/** كيان السلسلة اليومية يعاد تصديره مع المكوّن كي تستورده اللوحات من المكتبة */
export type { DailyPoint };

/*
  رسم مساحي لسلسلة يومية (مواصفة 003) — نفس قواعد BarChart: شبكة خفيفة،
  أقدم الأيام على اليمين (RTL)، وPanelEmpty عند السلسلة الفارغة أو كلها
  أصفار. تسميات المحور كل ~٧ أيام بصيغة «يوم/شهر».

  الارتفاع البصري ثابت (١٨٠px ثم ٢٢٠px من sm) والعرض يملأ البطاقة: يُمدّد
  الـSVG بـ preserveAspectRatio="none" مع vector-effect="non-scaling-stroke"
  فلا يتغيّر سمك الخطوط، وتُرسم تسميات التواريخ HTML تحت الرسم فلا تتمدد
  مع العرض. أول تسمية (الأقدم) تُثبَّت لليمين وآخرها (الأحدث) لليسار كي
  لا تُقتَطعا عند حافّتي البطاقة.
*/

const W = 300;
const H = 170;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;
const PAD_X = 8;
const GRID_LINES = 4;
/** مسافة عرض بين تسميتي محور متجاورتين كي لا تتراكب آخر تسمية بسابقتها */
const LABEL_EVERY = 7;
/** ارتفاع الرسم كاملاً (المنحنى + التسميات): ثابت على الجوّال وأكبر قليلاً من sm */
const CHART_HEIGHT = "h-[180px] sm:h-[220px]";

/** أعلى قيمة «لطيفة» للمحور بحيث تقع خطوط الشبكة على أرقام صحيحة (مثل BarChart) */
function niceMax(max: number): number {
  if (max <= 4) return 4;
  return Math.ceil(max / GRID_LINES) * GRID_LINES;
}

/** تسمية المحور تظهر كل ~٧ أيام، وآخر يوم يُعرض إن لم يلصق بتسمية سابقة */
function hasAxisLabel(i: number, count: number): boolean {
  if (i % LABEL_EVERY === 0) return true;
  return i === count - 1 && (count - 1) % LABEL_EVERY > 3;
}

export function AreaChart({ points, ariaLabel }: { points: DailyPoint[]; ariaLabel: string }) {
  const rawMax = Math.max(...points.map((p) => p.value), 0);
  if (points.length === 0 || rawMax === 0) return <PanelEmpty />;

  const max = niceMax(rawMax);
  const n = points.length;
  const plotH = H - PAD_TOP - PAD_BOTTOM;
  const step = W - PAD_X * 2;
  const x = (i: number) => W - PAD_X - (n === 1 ? step / 2 : (step * i) / (n - 1));
  const y = (v: number) => PAD_TOP + plotH - (v / max) * plotH;
  const baseY = PAD_TOP + plotH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${baseY} L${x(0).toFixed(1)} ${baseY} Z`;

  /** موضع تسمية HTML: الطرفان ملتصقان بحافّتي البطاقة والوسطى على نقاطها */
  const labelStyle = (i: number): CSSProperties => {
    if (n === 1) return { left: "50%", transform: "translateX(-50%)" };
    if (i === 0) return { right: 0 };
    if (i === n - 1) return { left: 0 };
    return { left: `${((x(i) / W) * 100).toFixed(2)}%`, transform: "translateX(-50%)" };
  };

  return (
    <div className={`relative w-full ${CHART_HEIGHT}`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={ariaLabel}
        className="absolute inset-0 h-full w-full"
      >
        {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
          const gy = PAD_TOP + plotH - (plotH * i) / GRID_LINES;
          return (
            <line
              key={i}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={gy}
              y2={gy}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray={i === 0 ? undefined : "3 4"}
              vectorEffect="non-scaling-stroke"
              className="text-border"
            />
          );
        })}
        <path d={area} fill="currentColor" className={TONES.accent25.className} style={{ opacity: TONES.accent25.opacity }} />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={TONES.accent100.className}
          style={{ opacity: TONES.accent100.opacity }}
        />
      </svg>
      {/* نقطة وحيدة: دائرة HTML — دائرة داخل الـSVG الممدود تتشوّه إلى قطع ناقص */}
      {n === 1 && (
        <span
          aria-hidden="true"
          className={`absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current ${TONES.accent100.className}`}
          style={{ left: "50%", top: `${((y(points[0].value) / H) * 100).toFixed(2)}%`, opacity: TONES.accent100.opacity }}
        />
      )}
      {/* تسميات التواريخ HTML فتبقى ١١px مهما اتّسعت البطاقة (مقروءة عبر aria-label لا نصّاً) */}
      <div aria-hidden="true" className="absolute inset-0">
        {points.map((p, i) =>
          hasAxisLabel(i, n) ? (
            <span
              key={p.date}
              style={labelStyle(i)}
              className="tabular absolute bottom-0 whitespace-nowrap text-[11px] leading-none text-muted-foreground"
            >
              {dayMonthLabel(p.date)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
