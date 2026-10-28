import type { ReactNode } from "react";

/** بطاقة عائمة ناعمة — ظل واسع التمويه (انظر .fx-card في globals.css) ورفع خفيف عند المرور */
export const softCardClass =
  "fx-card fx-card-lift rounded-2xl border border-border bg-surface";

/** لون سلسلة في الرسوم: صنف نصي من رموز الهوية + شفافية (تدرّج البيج للسلاسل المحايدة) */
export type Tone = { className: string; opacity: number };

export const TONES = {
  accent100: { className: "text-accent", opacity: 1 },
  accent70: { className: "text-accent", opacity: 0.7 },
  accent45: { className: "text-accent", opacity: 0.45 },
  accent25: { className: "text-accent", opacity: 0.25 },
  success: { className: "text-success", opacity: 1 },
  destructive: { className: "text-destructive", opacity: 1 },
} satisfies Record<string, Tone>;

/** نقطة ملوّنة لقائمة المفتاح */
export function Dot({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-current ${tone.className}`}
      style={{ opacity: tone.opacity }}
    />
  );
}

/** لوحة: عنوان على جهة وزر pill صغير اختياري على الجهة الأخرى */
export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`${softCardClass} flex flex-col p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** زر/رابط pill صغير في ترويسة اللوحة */
export const pillClass =
  "shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** شريحة حالة صغيرة بجانب الأرقام الكبيرة (سهم اختياري + نص) */
export function Chip({
  tone,
  arrow,
  children,
}: {
  tone: "success" | "destructive" | "neutral";
  arrow?: "up" | "down";
  children: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "bg-success-soft text-success"
      : tone === "destructive"
        ? "bg-destructive-soft text-destructive"
        : "bg-accent-soft text-accent-ink";
  return (
    <span className={`tabular inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${toneClass}`}>
      {arrow && (
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {arrow === "up" ? <path d="M5 8.5V1.5M2 4.5l3-3 3 3" /> : <path d="M5 1.5v7M2 5.5l3 3 3-3" />}
        </svg>
      )}
      {children}
    </span>
  );
}

/** حالة فارغة موحّدة داخل اللوحة */
export function PanelEmpty() {
  return <p className="py-10 text-center text-sm text-muted-foreground">لا توجد بيانات بعد</p>;
}
