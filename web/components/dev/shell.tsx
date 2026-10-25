"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleSwitcher } from "../role-switcher";
import { BrandLockup } from "../brand";
import { BackButton } from "../back-button";
import { InstallBanner } from "../install-banner";
import { ChartIcon, ClipboardIcon, CloseIcon, LogoutIcon, MailIcon } from "../icons";
import { DEV_NAV_ITEMS, DEV_SETTINGS_ITEM, splitDevMobileNav, type DevNavItem } from "@/lib/dev-nav";

/*
  قالب لوحة المطوّر — ديسكتوب: سايدبار داكن خاص بهذه اللوحة وحده (مستقل عن
  قالب الجامع الفاتح). جوال (<768px): شريط سفلي ثابت بأسلوب التطبيقات
  الأصلية — شريط أسود بفتحة دائرية بمنتصفه يرتفع عنها زر «البلاغات»، ثلاث
  خانات مباشرة + «المزيد» الذي يفتح ورقة سفلية ببقية الصفحات. التقسيم
  النقي في lib/dev-nav.ts.
 */

/** إيموجي السايدبار والورقة — عناصر الشريط السفلي نفسها بأيقونات SVG */
const EMOJI: Record<string, string> = {
  overview: "📊",
  mosques: "🕌",
  "mosque-requests": "📝",
  associations: "🏛️",
  "association-requests": "📋",
  "data-requests": "🗑️",
  users: "👥",
  reports: "📮",
  health: "🩺",
  suggestions: "💡",
  "agent-lessons": "🤖",
  whatsapp: "💬",
  audit: "🧾",
  help: "❓",
  settings: "⚙️",
};

/** الصفحات ذات شارة العدّاد → مسار API يرجع ?count=1 */
const BADGE_ENDPOINTS: Record<string, string> = {
  "/dev/mosque-requests": "/api/dev/mosque-requests",
  "/dev/association-requests": "/api/dev/association-requests",
  "/dev/data-requests": "/api/dev/data-requests",
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/dev") return pathname === "/dev";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DevShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  /** عدّاد المعلّق لكل صفحة تحمل شارة: المفتاح مسار الصفحة */
  const [badges, setBadges] = useState<Record<string, number>>({});
  const pendingRequests = badges["/dev/mosque-requests"] ?? 0;
  const [sheetOpen, setSheetOpen] = useState(false);
  const { bar, center, more } = splitDevMobileNav([...DEV_NAV_ITEMS, DEV_SETTINGS_ITEM]);

  // شارات الطلبات المعلّقة (جوامع، جمعيات، حذف بيانات) — فشل جلب أحدها يخفي شارته فقط
  useEffect(() => {
    let cancelled = false;
    for (const href of Object.keys(BADGE_ENDPOINTS)) {
      fetch(`${BADGE_ENDPOINTS[href]}?count=1`)
        .then((res) => (res.ok ? res.json() : { pending: 0 }))
        .then((data: { pending?: number }) => {
          if (!cancelled) setBadges((prev) => ({ ...prev, [href]: Number(data.pending ?? 0) }));
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // ورقة «المزيد»: Esc يغلقها كأي حوار
  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      window.location.href = "/admin";
    } finally {
      setBusy(false);
    }
  }

  const links = (vertical: boolean, items = DEV_NAV_ITEMS) =>
    items.map((item) => {
      const active = vertical && isActive(pathname, item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
            active ? "bg-white/10 font-semibold text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span aria-hidden>{EMOJI[item.id] ?? "•"}</span>
          <span className={vertical ? "" : "md:hidden"}>{item.label}</span>
          {(badges[item.href] ?? 0) > 0 && (
            <span
              className="tabular rounded-full bg-secondary px-1.5 text-[11px] font-bold leading-normal text-on-secondary"
              aria-label={`${badges[item.href]} طلب معلّق`}
            >
              {badges[item.href]}
            </span>
          )}
        </Link>
      );
    });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* الجوال: ترويسة صغيرة — التنقّل كله في الشريط السفلي */}
      <header className="flex items-center justify-between gap-3 bg-black px-4 py-2 md:hidden">
        <p className="font-naskh text-sm font-bold text-white">لوحة المطوّر</p>
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          aria-label="خروج"
          className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <LogoutIcon size={18} />
        </button>
      </header>

      {/* الشاشات الواسعة: سايدبار داكن */}
      <aside className="hidden w-56 shrink-0 flex-col bg-black px-3 py-5 md:flex">
        <div className="mb-6 px-2">
          <BrandLockup tone="onDark" context="لوحة المطوّر" />
        </div>
        <nav aria-label="القائمة الرئيسية" className="flex flex-1 flex-col gap-1 overflow-y-auto">{links(true)}</nav>
        <div className="mt-2 border-t border-white/10 pt-2">{links(true, [DEV_SETTINGS_ITEM])}</div>
        {/* جلسة الأدمن بلا مستخدم موحّد (ADMIN_SECRET ليس حساباً) فيختفي
            المبدّل تلقائياً؛ يظهر فقط لو دخلت اللوحة بحساب له عضويات أخرى */}
        <RoleSwitcher />
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="mt-4 cursor-pointer rounded-lg px-3 py-2 text-right text-sm text-white/60 transition-colors duration-200 hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          {busy ? "…" : "خروج ←"}
        </button>
      </aside>

      <main className="min-w-0 flex-1 bg-background px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-6">
        <InstallBanner app="dev" />
        <BackButton className="mb-4" />
        {children}
      </main>

      {/* الجوال: شريط سفلي ثابت بفتحة دائرية وزر مرتفع بالمنتصف */}
      <MobileBottomBar
        pathname={pathname}
        bar={bar}
        center={center}
        more={more}
        pendingRequests={pendingRequests}
        badges={badges}
        sheetOpen={sheetOpen}
        onToggleSheet={() => setSheetOpen((v) => !v)}
        onCloseSheet={() => setSheetOpen(false)}
      />
    </div>
  );
}

/** أيقونة جامع/نقاط — SVG مضمّن بلون sand، والفعّال beige */
function MosqueIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3c.5 1.2 1.5 2 2.6 2.9C16.4 7.3 19 8.8 19 12v9H5v-9c0-3.2 2.6-4.7 4.4-6.1C10.5 5 11.5 4.2 12 3Z" />
      <path d="M10 21v-4a2 2 0 1 1 4 0v4" />
      <path d="M3 21h18" />
    </svg>
  );
}

function MoreIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

function BarIcon({ id }: { id: string }) {
  if (id === "overview") return <ChartIcon size={22} />;
  if (id === "mosques") return <MosqueIcon />;
  if (id === "mosque-requests") return <ClipboardIcon size={22} />;
  if (id === "reports") return <MailIcon size={22} />;
  return <MoreIcon />;
}

function MobileBottomBar({
  pathname,
  bar,
  center,
  more,
  pendingRequests,
  badges,
  sheetOpen,
  onToggleSheet,
  onCloseSheet,
}: {
  pathname: string;
  bar: DevNavItem[];
  center: DevNavItem | null;
  more: DevNavItem[];
  pendingRequests: number;
  badges: Record<string, number>;
  sheetOpen: boolean;
  onToggleSheet: () => void;
  onCloseSheet: () => void;
}) {
  const itemActive = (href: string) => isActive(pathname, href);

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 z-[60] md:hidden" role="presentation">
          <div className="absolute inset-0 bg-black/60" onClick={onCloseSheet} aria-hidden />
          <div
            id="dev-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="المزيد"
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-black p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          >
            <div className="mb-2 flex items-center justify-between px-2 pt-1">
              <p className="text-sm font-bold text-white">المزيد</p>
              <button
                type="button"
                onClick={onCloseSheet}
                aria-label="إغلاق"
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
              >
                <CloseIcon size={20} />
              </button>
            </div>
            <nav aria-label="صفحات إضافية" className="grid grid-cols-2 gap-1">
              {more.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onCloseSheet}
                  aria-current={itemActive(item.href) ? "page" : undefined}
                  className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-3 text-sm transition-colors duration-200 hover:bg-white/5 ${
                    itemActive(item.href) ? "bg-white/10 font-semibold text-white" : "text-sand hover:text-white"
                  }`}
                >
                  <span aria-hidden>{EMOJI[item.id] ?? "•"}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {(badges[item.href] ?? 0) > 0 && (
                    <span
                      className="tabular rounded-full bg-secondary px-1.5 text-[11px] font-bold leading-normal text-on-secondary"
                      aria-label={`${badges[item.href]} طلب معلّق`}
                    >
                      {badges[item.href]}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-50 md:hidden">
        {center && (
          <Link
            href={center.href}
            aria-current={itemActive(center.href) ? "page" : undefined}
            aria-label={center.label}
            className="absolute left-1/2 z-10 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-secondary text-on-secondary ring-4 ring-black transition-transform duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            style={{ bottom: "calc(2rem + env(safe-area-inset-bottom))" }}
          >
            <BarIcon id={center.id} />
          </Link>
        )}

        <nav
          aria-label="القائمة الرئيسية"
          className="bg-black"
          style={{
            WebkitMaskImage: "radial-gradient(circle at 50% 0, transparent 31px, black 32px)",
            maskImage: "radial-gradient(circle at 50% 0, transparent 31px, black 32px)",
          }}
        >
          <div
            className="mx-auto grid max-w-lg grid-cols-5 items-stretch px-1"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {bar.slice(0, 3).map((item) => (
              <Link
                key={item.id}
                href={item.href}
                aria-current={itemActive(item.href) ? "page" : undefined}
                className="relative flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                style={{ color: itemActive(item.href) ? "var(--color-secondary)" : "var(--color-sand)" }}
              >
                <BarIcon id={item.id} />
                <span className="max-w-full truncate px-0.5 text-[10px] leading-none">{item.label}</span>
                {item.id === "mosque-requests" && pendingRequests > 0 && (
                  <span
                    className="tabular absolute right-2 top-1 rounded-full bg-secondary px-1.5 text-[10px] font-bold leading-normal text-on-secondary"
                    aria-label={`${pendingRequests} طلب معلّق`}
                  >
                    {pendingRequests}
                  </span>
                )}
              </Link>
            ))}
            {/* خانة الفتحة — الزر الدائري مرسوم فوقها خارج الشبكة */}
            <span aria-hidden />
            <button
              type="button"
              onClick={onToggleSheet}
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              aria-controls="dev-more-sheet"
              className="relative flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              style={{ color: sheetOpen ? "var(--color-secondary)" : "var(--color-sand)" }}
            >
              <MoreIcon />
              <span className="text-[10px] leading-none">المزيد</span>
              {more.some((item) => (badges[item.href] ?? 0) > 0) && (
                <span
                  className="absolute right-3 top-1.5 h-2 w-2 rounded-full bg-secondary"
                  aria-label="طلبات معلّقة داخل المزيد"
                />
              )}
            </button>
          </div>
        </nav>
      </div>
    </>
  );
}
