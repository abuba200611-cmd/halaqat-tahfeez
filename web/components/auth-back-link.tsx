import { BackButton } from "./back-button";

/*
  زر «الرجوع للواجهة» الموحّد لكل صفحات الدخول/التسجيل — يعود دائماً إلى
  /welcome (لا إلى "/" الذي قد يعرض شاشة دخول المعلّم). نفس مكوّن BackButton
  (نفس الشكل والحجم)، بوضع المسار الاحتياطي الثابت. tone="onDark" للأسطح
  السوداء (AuthShell)، و"onLight" للصفحات الفاتحة.
*/
export function AuthBackLink({ tone = "onDark", className = "" }: { tone?: "onDark" | "onLight"; className?: string }) {
  return (
    <BackButton
      href="/welcome"
      mode="fallback"
      force
      label="الرجوع للواجهة"
      tone={tone === "onDark" ? "onDark" : "default"}
      className={className}
    />
  );
}
