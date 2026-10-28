import { PanelEmpty, type Tone } from "./panel";

export type HBar = {
  label: string;
  value: number;
  tone: Tone;
  /** true = تُعرض القيمة نسبة مئوية (٪) — مثل نسبة الحضور */
  pct?: boolean;
};

/*
  أعمدة أفقية (مواصفة 003) لتسميات طويلة كأسماء الجوامع والحلقات: التسمية
  يميناً، العمود ينمو من اليمين (RTL)، والقيمة بجانب العمود. التسمية
  الطويلة تُختصر بعلامة «…» والنص الكامل في title. السلسلة الفارغة أو
  كلها أصفار = PanelEmpty. مسارًا بسيطًا بعنصر النسبة بدل SVG لأن الاختصار
  والtitle صفات HTML نصية لا تتوفر بنص SVG بلا قياس عرض.
*/
export function HBarChart({ bars, ariaLabel }: { bars: HBar[]; ariaLabel: string }) {
  const max = Math.max(...bars.map((b) => b.value), 0);
  if (max === 0) return <PanelEmpty />;

  return (
    <ul role="img" aria-label={ariaLabel} className="space-y-2.5">
      {bars.map((b) => (
        <li key={b.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-end text-xs text-muted-foreground sm:w-28" title={b.label}>
            {b.label}
          </span>
          <span className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className={`block h-full rounded-full bg-current ${b.tone.className}`}
              style={{ width: `${(b.value / max) * 100}%`, opacity: b.tone.opacity }}
            />
          </span>
          <span className="tabular w-12 shrink-0 text-xs font-medium text-foreground">
            {b.pct ? `${b.value}٪` : b.value}
          </span>
        </li>
      ))}
    </ul>
  );
}
