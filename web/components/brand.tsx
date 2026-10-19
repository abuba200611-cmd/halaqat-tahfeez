import Image from "next/image";
import Link from "next/link";

/*
  شعار «السلام» الموحّد: رمز + اسم بخط KOMission + سطر MOS الفرعي.
  tone="onDark" للأسطح السوداء (logo-light.png)، و"onLight" للفاتحة (logo.png).
  سياق القسم (المعلم/إدارة الجامع...) يظهر كسطر صغير تحت السطر الفرعي.
*/

const LOGO_RATIO = 766 / 821;

export function BrandLockup({
  tone = "onDark",
  size = 40,
  context,
  href = "/",
  className = "",
}: {
  tone?: "onDark" | "onLight";
  size?: number;
  context?: string;
  href?: string;
  className?: string;
}) {
  const onDark = tone === "onDark";
  const width = Math.round(size * LOGO_RATIO);
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Image
        src={onDark ? "/brand/logo-light.png" : "/brand/logo.png"}
        alt="شعار السلام"
        width={width}
        height={size}
        priority={false}
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={href}
          className={`font-display block pb-0.5 text-xl leading-[1.35] font-black ${onDark ? "text-sand" : "text-foreground"}`}
        >
          السلام
        </Link>
        <p className={`truncate text-[11px] leading-normal ${onDark ? "text-sand/80" : "text-muted-foreground"}`}>
          MOS — نظام تشغيل الجامع
        </p>
        {context && (
          <p className={`truncate text-[11px] leading-normal ${onDark ? "text-white/60" : "text-muted-foreground/80"}`}>
            {context}
          </p>
        )}
      </div>
    </div>
  );
}

export function BrandLogo({
  tone = "onLight",
  size = 48,
  className = "",
}: {
  tone?: "onDark" | "onLight";
  size?: number;
  className?: string;
}) {
  const width = Math.round(size * LOGO_RATIO);
  return (
    <Image
      src={tone === "onDark" ? "/brand/logo-light.png" : "/brand/logo.png"}
      alt="شعار السلام"
      width={width}
      height={size}
      className={className}
    />
  );
}
