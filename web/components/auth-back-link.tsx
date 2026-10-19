import Link from "next/link";

/*
  رابط «الرجوع للواجهة» الموحّد لكل صفحات الدخول/التسجيل — يعود دائماً إلى
  /welcome (لا إلى "/" الذي قد يعرض شاشة دخول المعلّم). tone="onDark" للأسطح
  السوداء (AuthShell)، و"onLight" للصفحات الفاتحة.
*/
export function AuthBackLink({ tone = "onDark", className = "" }: { tone?: "onDark" | "onLight"; className?: string }) {
  const color = tone === "onDark" ? "text-sand/90 hover:text-white" : "text-muted-foreground hover:text-foreground";
  return (
    <Link
      href="/welcome"
      className={`inline-flex items-center gap-1.5 py-1 text-sm font-semibold leading-normal transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${color} ${className}`}
    >
      <span aria-hidden>→</span>
      الرجوع للواجهة
    </Link>
  );
}
