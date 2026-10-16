"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { RoleSwitcher } from "./role-switcher";

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

  const logout = useCallback(async () => {
    await fetch("/api/parent-auth/logout", { method: "POST" });
    setParent(null);
  }, []);

  return (
    <ParentContext.Provider value={{ parent, checking, setParent, logout }}>
      <div className="flex min-h-full flex-1 flex-col bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-3">
            <Link href="/parent" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-900 font-naskh text-lg font-bold text-white">
                👪
              </span>
              <span className="font-naskh text-lg font-bold text-slate-800">متابعة الأبناء</span>
              <span className="hidden text-[10px] text-slate-400 sm:inline">MOS — نظام تشغيل الجامع</span>
            </Link>
            {parent && (
              <div className="mr-auto flex items-center gap-3">
                <span className="hidden max-w-40 truncate text-sm text-slate-500 sm:block">{parent.name}</span>
                <Link
                  href="/parent/suggest"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-50"
                >
                  اقتراح / بلاغ
                </Link>
                <RoleSwitcher tone="light" />
                <button
                  type="button"
                  onClick={logout}
                  className="cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  خروج
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
      </div>
    </ParentContext.Provider>
  );
}
