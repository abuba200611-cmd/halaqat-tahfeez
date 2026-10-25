"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BrandLockup } from "./brand";
import { RoleSwitcher } from "./role-switcher";
import { CloseIcon, LogoutIcon, MenuIcon } from "./icons";
import { splitBottomNav } from "@/lib/bottom-nav";

export type RoleNavItem = { href: string; label: string; desc?: string; icon: React.ReactNode; badge?: React.ReactNode };

/* نفس لوحة ألوان هيكل المعلّم بالضبط (components/auth-gate.tsx) — يتشاركها هيكلا الطالب وولي الأمر */
export const SIDEBAR_COLORS = {
  sidebar: "#000000",
  sidebarActive: "#AD7D56",
  sidebarText: "#CDB49E",
};
const B = SIDEBAR_COLORS;

/**
 * القائمة الجانبية المشتركة (طالب/ولي أمر) — من md (٧٦٨px) فصاعداً فقط، بلا Drawer وسيط: تحت
 * ٧٦٨px BottomNav هو التنقّل الوحيد كما طلبت المواصفة بالضبط (بخلاف
 * قائمة المعلّم التي تستخدم Drawer بين الجوال وlg).
 */
export function RoleSidebar({
  nav,
  homeHref,
  brandContext,
  user,
  fallbackInitial,
  onLogout,
}: {
  nav: RoleNavItem[];
  homeHref: string;
  brandContext: string;
  user: { name: string; sub: string };
  fallbackInitial: string;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const initial = (user.name || fallbackInitial).trim().charAt(0);

  return (
    <aside className="no-print fixed inset-y-0 right-0 z-20 hidden w-64 flex-col md:flex" style={{ backgroundColor: B.sidebar }}>
      <div className="px-5 py-5">
        <BrandLockup tone="onDark" context={brandContext} href={homeHref} />
      </div>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((item) => {
          const active = item.href === homeHref ? pathname === homeHref : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{
                backgroundColor: active ? B.sidebarActive : "transparent",
                color: active ? "#000000" : B.sidebarText,
                fontWeight: active ? 600 : 400,
              }}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <span
            className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-on-secondary"
            style={{ backgroundColor: "var(--color-secondary)" }}
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user.name}</div>
            <div className="truncate text-xs" style={{ color: B.sidebarText }}>
              {user.sub}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="shrink-0 cursor-pointer rounded-md p-1.5 text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title="خروج"
          >
            <LogoutIcon size={17} />
          </button>
        </div>
        <RoleSwitcher />
      </div>
    </aside>
  );
}

/**
 * شريط تنقّل ثابت أسفل الشاشة — جوال فقط (<768px) بدل القائمة الجانبية،
 * مع مراعاة safe-area لآيفون (STEP 58). يتّسع لخمس خانات: إن زادت العناصر
 * أخذ «المزيد» الخانة الخامسة وفتح ورقة سفلية بالعناصر المتبقية
 * (اختباراتي، زملائي…) فلا يضيع أي منفذ على الجوال.
 */
export function RoleBottomNav({ nav, homeHref, sheetId }: { nav: RoleNavItem[]; homeHref: string; sheetId: string }) {
  const pathname = usePathname();
  const { primary, overflow } = splitBottomNav(nav);
  // الورقة مرتبطة بالمسار الذي فُتحت عنده: تنقّل الصفحة يغلقها دون setState داخل effect
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const moreOpen = openedAt === pathname;
  const setMoreOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof open === "function" ? open(moreOpen) : open;
    setOpenedAt(next ? pathname : null);
  };
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const isActive = (item: RoleNavItem) => (item.href === homeHref ? pathname === homeHref : pathname.startsWith(item.href));
  const moreActive = overflow.some(isActive);

  // Escape يغلق ويعيد التركيز لزر «المزيد»؛ وعند الفتح ينتقل التركيز لأول رابط
  useEffect(() => {
    if (!moreOpen) return;
    const button = moreButtonRef.current;
    sheetRef.current?.querySelector<HTMLElement>("a")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenedAt(null);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [moreOpen]);

  const itemClass = (active: boolean) =>
    `flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
      active ? "font-semibold" : "text-muted-foreground"
    }`;
  const activeStyle = (active: boolean) => (active ? { color: "var(--color-accent-ink)" } : undefined);

  return (
    <>
      {moreOpen && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div
            ref={sheetRef}
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-label="المزيد"
            className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface px-3 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="font-display text-base font-bold text-foreground">المزيد</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="إغلاق"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <ul className="space-y-1">
              {overflow.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        active ? "font-semibold" : "text-foreground"
                      }`}
                      style={activeStyle(active)}
                    >
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      {item.badge}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        aria-label="التنقّل الرئيسي"
        className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primary.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={itemClass(active)}
              style={activeStyle(active)}
            >
              <span className="relative">
                {item.icon}
                {item.badge && <span className="absolute -top-1.5 -left-2.5">{item.badge}</span>}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        {overflow.length > 0 && (
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls={sheetId}
            className={itemClass(moreActive || moreOpen)}
            style={activeStyle(moreActive || moreOpen)}
          >
            <MenuIcon size={19} />
            <span className="truncate">المزيد</span>
          </button>
        )}
      </nav>
    </>
  );
}

