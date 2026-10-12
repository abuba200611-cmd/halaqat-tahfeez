"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { LogoutIcon, MenuIcon, XIcon } from "./icons";

type NavItem = { href: string; label: string; icon: ReactNode; active?: boolean };

/**
 * قالب لوحة SaaS: سايدبار داكن كامل (شعار + قائمة أيقونة/تسمية + بطاقة
 * المستخدم بالأسفل) — ثابت بعرضه على الشاشات الواسعة، ويتحوّل على
 * الجوال لدرج منزلق (overlay) يُفتح بزر بالشريط العلوي بدل ما يزاحم
 * المحتوى بعرض ثابت (كان يترك عمود ضيق جداً على شاشة 375px).
 */
export function DashboardShell({
  nav,
  title,
  subtitle,
  userLabel,
  onLogout,
  children,
}: {
  nav: NavItem[];
  title: string;
  subtitle?: string;
  userLabel?: string;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const sidebarContent = (
    <>
      <div className="mb-6 flex items-center justify-between px-2">
        <div>
          <p className="font-naskh text-lg font-bold">إدارة الجامع</p>
          <p className="text-xs text-white/60">لوحة القيادة</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors duration-200 ${
              item.active ? "bg-white/15 font-semibold text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </nav>

      {userLabel && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-naskh text-xs font-bold text-on-primary">
            {userLabel.trim().charAt(0) || "؟"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{userLabel}</p>
          </div>
          <button
            onClick={onLogout}
            title="خروج"
            className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/70 transition-colors duration-200 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen w-full print:block">
      {/* سايدبار ثابت — شاشات واسعة فقط */}
      <aside className="hidden w-60 shrink-0 flex-col bg-foreground px-3 py-5 text-white lg:flex print:hidden">
        {sidebarContent}
      </aside>

      {/* درج منزلق — جوال/تابلت */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden print:hidden">
          <button
            aria-label="إغلاق القائمة"
            onClick={() => setOpen(false)}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <aside className="absolute inset-y-0 right-0 flex w-64 max-w-[80vw] flex-col bg-foreground px-3 py-5 text-white shadow-xl">
            {sidebarContent}
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="border-b border-border bg-surface px-4 py-4 sm:px-6 print:hidden">
          <div className="mx-auto flex max-w-5xl items-center gap-3">
            <button
              onClick={() => setOpen(true)}
              className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="فتح القائمة"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-naskh text-xl font-bold text-foreground">{title}</h1>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
