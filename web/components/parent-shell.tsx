"use client";

import { InstallBanner } from "@/components/install-banner";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackButton } from "./back-button";
import { AuthShell } from "./auth-shell";
import { RoleSwitcherList } from "./role-switcher";
import { RoleBottomNav, RoleSidebar, type RoleNavItem } from "./role-shell-nav";
import { CheckCircleIcon, ClipboardIcon, HelpIcon, HomeIcon, MailIcon, MessageIcon, SettingsIcon } from "./icons";
import { MessagesBadge } from "./messages-badge";

/*
  STEP 61 — هيكل ولي الأمر: نفس هيكل الطالب والمعلّم (قائمة جانبية سوداء من md،
  شريط علوي، وشريط سفلي على الجوال — components/role-shell-nav.tsx). حالة الجلسة تُجلب من /api/parent-auth/me
  وتُشارَك مع صفحات المجموعة (الدخول، الانضمام، اللوحة) عبر سياق.
*/

export type ParentSession = { id: number; name: string; email: string };

type ParentContextValue = {
  parent: ParentSession | null;
  checking: boolean;
  setParent: (parent: ParentSession | null) => void;
  logout: () => Promise<void>;
};

const ParentContext = createContext<ParentContextValue | null>(null);

export function useParentSession(): ParentContextValue {
  const ctx = useContext(ParentContext);
  if (!ctx) throw new Error("useParentSession must be used inside ParentShell");
  return ctx;
}

export function ParentShell({ children }: { children: React.ReactNode }) {
  const [parent, setParent] = useState<ParentSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [feesEnabled, setFeesEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/parent-auth/me")
      .then((res) => res.json())
      .then((data: { parent: ParentSession | null }) => {
        if (!cancelled) setParent(data.parent);
      })
      .catch(() => {
        if (!cancelled) setParent(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // رابط الرسوم يظهر فقط إن كانت الميزة مفعّلة لجامع أحد الأبناء (الخادم يحدّد)
  const parentId = parent?.id ?? null;
  useEffect(() => {
    if (parentId === null) return;
    let cancelled = false;
    fetch("/api/parent/fees?check=1")
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data: { enabled?: boolean }) => {
        if (!cancelled) setFeesEnabled(data.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setFeesEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  const logout = useCallback(async () => {
    await fetch("/api/parent-auth/logout", { method: "POST" });
    setParent(null);
  }, []);

  const nav: RoleNavItem[] = [
    { href: "/parent", label: "أبنائي", desc: "متابعة الحفظ والحضور", icon: <HomeIcon size={19} /> },
    { href: "/parent/exams", label: "نتائج الاختبارات", icon: <CheckCircleIcon size={19} /> },
    ...(feesEnabled ? [{ href: "/parent/fees", label: "الرسوم", icon: <ClipboardIcon size={19} /> }] : []),
    { href: "/parent/messages", label: "الرسائل", icon: <MessageIcon size={19} />, badge: <MessagesBadge role="parent" /> },
    { href: "/parent/help", label: "كيف أستخدم المنصة؟", icon: <HelpIcon size={19} /> },
    { href: "/parent/suggest", label: "اقتراح / بلاغ", icon: <MailIcon size={19} /> },
    { href: "/parent/settings", label: "الإعدادات", icon: <SettingsIcon size={19} /> },
  ];

  const value = { parent, checking, setParent, logout };

  if (checking) {
    return (
      <ParentContext.Provider value={value}>
        <main className="flex flex-1 items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>
        </main>
      </ParentContext.Provider>
    );
  }

  // قبل الدخول (الدخول/الانضمام): نفس غلاف دخول الطالب والمعلّم (AuthShell)
  if (!parent) {
    return (
      <ParentContext.Provider value={value}>
        <AuthShell>{children}</AuthShell>
      </ParentContext.Provider>
    );
  }

  return (
    <ParentContext.Provider value={value}>
      <div className="flex min-h-full flex-1">
        <RoleSidebar
          nav={nav}
          homeHref="/parent"
          brandContext="متابعة الأبناء"
          user={{ name: parent.name, sub: parent.email }}
          fallbackInitial="و"
          onLogout={logout}
        />

        <div className="min-w-0 flex-1 pb-20 md:pb-0 md:mr-64">
          <TopBar nav={nav} parent={parent} onLogout={logout} />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-8">
            <InstallBanner />
            {children}
          </main>
        </div>

        <RoleBottomNav nav={nav} homeHref="/parent" sheetId="parent-more-sheet" />
      </div>
    </ParentContext.Provider>
  );
}

/** الشريط العلوي — نفس شريط الطالب: عنوان الصفحة، الاسم، وقائمة الحساب (الإعدادات/تبديل الدور/خروج) */
function TopBar({ nav, parent, onLogout }: { nav: RoleNavItem[]; parent: ParentSession; onLogout: () => void }) {
  const pathname = usePathname();
  const active = nav.find((item) => (item.href === "/parent" ? pathname === "/parent" : pathname.startsWith(item.href))) ?? nav[0];
  const initial = (parent.name || "و").trim().charAt(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [menuOpen]);

  return (
    <header className="no-print border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 md:px-8">
        <BackButton />
        <div className="min-w-0">
          <h1 className="font-display truncate whitespace-nowrap text-base font-bold text-foreground sm:text-lg">{active.label}</h1>
          {active.desc && <p className="hidden truncate text-xs text-muted-foreground sm:block">{active.desc}</p>}
        </div>

        <div className="mr-auto flex shrink-0 items-center gap-3">
          <div className="hidden max-w-48 text-left sm:block">
            <div className="truncate text-sm font-semibold text-foreground">{parent.name}</div>
            <div className="truncate text-xs text-muted-foreground">ولي أمر</div>
          </div>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="tabular flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sm font-bold text-on-secondary"
              style={{ backgroundColor: "var(--color-secondary)" }}
              aria-label="حساب ولي الأمر"
              aria-expanded={menuOpen}
            >
              {initial}
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
                <Link href="/parent/settings" onClick={() => setMenuOpen(false)} className="block px-4 py-2.5 text-sm text-foreground hover:bg-muted">
                  الإعدادات
                </Link>
                <RoleSwitcherList />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    void onLogout();
                  }}
                  className="block w-full cursor-pointer px-4 py-2.5 text-right text-sm text-destructive hover:bg-destructive-soft"
                >
                  تسجيل خروج
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
