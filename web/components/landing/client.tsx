"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { MotionConfig, animate, motion, useInView } from "motion/react";
import { INTRO_COOKIE, REGISTER_MOSQUE_PATH, safeNextPath } from "@/lib/landing";
import { CloseIcon, MenuIcon } from "@/components/icons";
import { CTA_PRIMARY } from "./cta";

/* مكوّنات التفاعل في /welcome — الصفحة نفسها خادمية، وهذي أوراق صغيرة فقط. */

const EASE = [0.22, 1, 0.36, 1] as const;

/** يحترم تفضيل «تقليل الحركة» لكل ما بداخله */
export function LandingMotion({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** ظهور عند التمرير */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** بطاقة ترتفع قليلاً عند المرور */
export function Lift({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
    >
      {children}
    </motion.div>
  );
}

/** العنوان الرئيسي: ظهور كلمة كلمة */
export function HeroTitle({ words, accentFrom }: { words: string[]; accentFrom: number }) {
  return (
    <h1 className="font-display text-[2.85rem] leading-[1.28] tracking-tight text-white sm:text-6xl sm:leading-[1.25] lg:text-[5.2rem] lg:leading-[1.2]">
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.18em] align-bottom">
          <motion.span
            className={`inline-block ${i >= accentFrom ? "bg-gradient-to-l from-[#AD7D56] via-[#CDB49E] to-[#e9d9c6] bg-clip-text text-transparent" : ""}`}
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.15 + i * 0.11, ease: EASE }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        </span>
      ))}
    </h1>
  );
}

/** عدّاد أرقام يرتفع عند ظهوره */
export function Ticker({ to, suffix = "", className = "" }: { to: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(to);
  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const controls = animate(0, to, {
      duration: 1.6,
      ease: EASE,
      onUpdate: (v) => setValue(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, to]);
  return (
    <span ref={ref} className={`tabular ${className}`}>
      {value.toLocaleString("ar-EG")}
      {suffix}
    </span>
  );
}

/** شريط تقدّم يمتلئ عند ظهوره */
export function Bar({ pct, className = "" }: { pct: number; className?: string }) {
  return (
    <motion.div
      className={`h-full origin-right rounded-full ${className}`}
      style={{ width: `${pct}%` }}
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 1.3, delay: 0.3, ease: EASE }}
    />
  );
}

/* ————— بوابة التسجيل: كوكي mos_intro + مسار المتابعة ————— */

/** يضبط كوكي «مرّ بالترحيب» (٣٠ يوماً) فور عرض الصفحة */
export function IntroCookie() {
  useEffect(() => {
    try {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${INTRO_COOKIE}=1; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax${secure}`;
    } catch {
      /* كوكيات معطّلة: البوابة تعيد المحاولة في الزيارة التالية */
    }
  }, []);
  return null;
}

function useNext(): string | null {
  return safeNextPath(useSearchParams().get("next"));
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </svg>
  );
}

function SignupCtaInner({ label, className, arrow }: { label: string; className: string; arrow: boolean }) {
  const next = useNext();
  return (
    <Link href={next ?? REGISTER_MOSQUE_PATH} className={className}>
      {label}
      {arrow && <Arrow />}
    </Link>
  );
}

/** زر تسجيل الجامع: يعود لمسار next الآمن إن وُجد، وإلا /register-mosque */
export function SignupCta({
  label,
  className = CTA_PRIMARY,
  arrow = true,
}: {
  label: string;
  className?: string;
  arrow?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <Link href={REGISTER_MOSQUE_PATH} className={className}>
          {label}
          {arrow && <Arrow />}
        </Link>
      }
    >
      <SignupCtaInner label={label} className={className} arrow={arrow} />
    </Suspense>
  );
}

function BannerInner() {
  const next = useNext();
  if (!next) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE }}
      className="bg-[#AD7D56] text-black"
      role="region"
      aria-label="متابعة التسجيل"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p className="text-sm font-semibold sm:text-base">تعرّفت على المنصة؟ أكمل من حيث توقفت.</p>
        <Link
          href={next}
          className="inline-flex items-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#241b12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        >
          متابعة التسجيل
          <Arrow />
        </Link>
      </div>
    </motion.div>
  );
}

export function NextBanner() {
  return (
    <Suspense fallback={null}>
      <BannerInner />
    </Suspense>
  );
}

/* ————— شريط التنقّل ————— */

const NAV = [
  { href: "#roles", label: "لمن المنصة" },
  { href: "#features", label: "المزايا" },
  { href: "#how", label: "كيف تبدأ" },
];

export function LandingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-8">
        <Link href="/welcome" className="flex shrink-0 items-center gap-2.5" aria-label="السلام — الرئيسية">
          <Image src="/brand/logo-light.png" alt="" width={34} height={36} priority />
          <span className="flex flex-col leading-none">
            <span className="font-display text-2xl text-white">السلام</span>
            <span className="mt-1 text-[10px] tracking-[0.2em] text-[#CDB49E]">MOS</span>
          </span>
        </Link>

        <nav aria-label="أقسام الصفحة" className="hidden items-center gap-8 md:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="text-sm font-medium text-[#CDB49E] transition-colors hover:text-white">
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:inline-block"
          >
            دخول
          </Link>
          <SignupCta
            label="تسجيل جامع"
            arrow={false}
            className="inline-flex items-center rounded-full bg-[#AD7D56] px-5 py-2 text-sm font-bold text-black transition-colors hover:bg-[#c08d66] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CDB49E]"
          />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10 md:hidden"
            aria-expanded={open}
            aria-controls="lp-menu"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <motion.div
          id="lp-menu"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="border-t border-white/10 bg-black px-5 pb-6 pt-3 md:hidden"
        >
          <nav aria-label="قائمة الجوال" className="flex flex-col">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/10 py-4 text-lg font-semibold text-white"
              >
                {n.label}
              </a>
            ))}
            <Link href="/login" onClick={() => setOpen(false)} className="py-4 text-lg font-semibold text-[#CDB49E]">
              دخول المنصة
            </Link>
          </nav>
        </motion.div>
      )}
    </header>
  );
}
