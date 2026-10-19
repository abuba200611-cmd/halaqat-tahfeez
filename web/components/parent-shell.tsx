"use client";

import { InstallBanner } from "@/components/install-banner";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BackButton } from "./back-button";
import { RoleSwitcher } from "./role-switcher";
import { BrandLockup } from "./brand";
import { MessagesBadge } from "./messages-badge";

/*
  STEP 61 — هيكل ولي الأمر: شريط علوي بسيط (عنوان + خروج) وبطاقات ضيقة،
  بلا قائمة جانبية — واجهة قراءة فقط. حالة الجلسة تُجلب من /api/parent-auth/me
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
  const pathname = usePathname();

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

  return (
    <ParentContext.Provider value={{ parent, checking, setParent, logout }}>
      <div className="flex min-h-full flex-1 flex-col bg-stone-50">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
            <Link href="/parent">
              <BrandLockup tone="onLight" size={36} context="متابعة الأبناء" />
            </Link>
            {parent && (
              <div className="mr-auto flex items-center gap-3">
                <span className="hidden max-w-40 truncate text-sm text-stone-500 sm:block">{parent.name}</span>
                <Link
                  href="/parent/exams"
                  className="hidden rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors duration-200 hover:bg-stone-50 sm:block"
                >
                  نتائج الاختبارات
                </Link>
                {feesEnabled && (
                  <Link
                    href="/parent/fees"
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors duration-200 hover:bg-stone-50"
                  >
                    الرسوم
                  </Link>
                )}
                <Link
                  href="/parent/messages"
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition-colors duration-200 hover:bg-accent-soft"
                >
                  الرسائل
                  <MessagesBadge role="parent" />
                </Link>
                <Link
                  href="/parent/suggest"
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors duration-200 hover:bg-stone-50"
                >
                  اقتراح / بلاغ
                </Link>
                <Link
                  href="/parent/settings"
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors duration-200 hover:bg-stone-50"
                >
                  الإعدادات
                </Link>
                <RoleSwitcher tone="light" />
                <button
                  type="button"
                  onClick={logout}
                  className="cursor-pointer rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                >
                  خروج
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
          {/* صفحة الدخول فيها «الرجوع للواجهة» الخاص بها */}
          {pathname !== "/parent/login" && <BackButton className="mb-4" />}
          <InstallBanner />
          {children}
        </main>
      </div>
    </ParentContext.Provider>
  );
}
