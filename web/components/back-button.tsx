"use client";

import { useRouter, usePathname } from "next/navigation";
import { NAV_STACK_KEY, canGoBackInApp, resolveBack } from "@/lib/back-nav";

type Tone = "default" | "onDark";

/*
  زر «→ رجوع» الموحّد لكل صفحات النظام. السهم لليمين لأن الاتجاه RTL.
  يعود بالتاريخ (router.back) إن وُجدت صفحة سابقة داخل التطبيق، وإلا ينتقل للمسار الاحتياطي
  (href) أو المحسوب من المسار الحالي. يُخفى تلقائياً في الصفحات الرئيسية وفي الطباعة.
  mode="fallback": ينتقل دائماً للمسار الاحتياطي (صفحات الدخول → /welcome).
*/
export function BackButton({
  href,
  label = "رجوع",
  tone = "default",
  mode = "history",
  force = false,
  className = "",
}: {
  href?: string;
  label?: string;
  tone?: Tone;
  mode?: "history" | "fallback";
  /** يعرض الزر حتى في الصفحة الرئيسية */
  force?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const resolved = resolveBack(pathname);
  if (!resolved.show && !force) return null;
  const fallback = href ?? resolved.fallback;

  function onClick() {
    if (mode === "history") {
      try {
        const raw = sessionStorage.getItem(NAV_STACK_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed) && canGoBackInApp(parsed as string[])) {
          router.back();
          return;
        }
      } catch {
        /* نكمل للمسار الاحتياطي */
      }
    }
    router.push(fallback);
  }

  const colors =
    tone === "onDark"
      ? "border-white/25 text-sand/90 hover:bg-white/10 hover:text-white"
      : "border-border bg-surface text-foreground hover:bg-muted";

  return (
    <button
      type="button"
      onClick={onClick}
      data-back-button
      className={`relative z-20 inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold leading-normal transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring print:hidden ${colors} ${className}`}
    >
      <span aria-hidden>→</span>
      {label}
    </button>
  );
}
