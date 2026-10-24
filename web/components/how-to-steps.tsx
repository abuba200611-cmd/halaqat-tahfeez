import Link from "next/link";
import type { ReactNode } from "react";

/*
  «كيف أستخدم المنصة؟» — قالب مساعدة موحّد لكل الأدوار: ٤–٦ خطوات مرقّمة
  قصيرة لمهام الدور الرئيسية، وكل خطوة قد تحمل زر إجراء ينقل لمسكها.
*/

export type HowToStep = {
  title: string;
  hint?: string;
  /** زر إجراء اختياري: نصه ومساره */
  cta?: { label: string; href: string };
};

export function HowToSteps({
  title = "كيف أستخدم المنصة؟",
  intro,
  steps,
}: {
  title?: string;
  intro?: string;
  steps: HowToStep[];
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        {intro && <p className="mt-1 text-sm text-muted-foreground">{intro}</p>}
      </div>
      <ol className="space-y-3">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-surface p-4"
          >
            <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold text-on-secondary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              {step.hint && <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.hint}</p>}
            </div>
            {step.cta && (
              <Link
                href={step.cta.href}
                className="shrink-0 self-center rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {step.cta.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** رابط «كيف أستخدم المنصة؟» — يُدمج بقوائم الإعدادات والقوائم السفلية */
export function HowToLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      className={
        className ??
        "font-semibold text-accent-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      }
    >
      كيف أستخدم المنصة؟
    </Link>
  );
}

/** فاصل صغير اختياري لأسفل صفحة المساعدة */
export function HowToFooter({ children }: { children: ReactNode }) {
  return <p className="pt-2 text-center text-xs text-muted-foreground">{children}</p>;
}
