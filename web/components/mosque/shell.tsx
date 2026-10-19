"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { RoleSwitcher } from "../role-switcher";
import { BrandLockup } from "../brand";
import { LogoutIcon, MenuIcon, XIcon } from "./icons";
import { GroupedNav } from "../grouped-nav";
import { groupByField } from "@/lib/nav-groups";

type NavItem = { href: string; label: string; icon: ReactNode; active?: boolean; badge?: ReactNode; group?: "top" | "features" | "bottom" };

const GROUP_DEFS = [
  { id: "top" },
  { id: "features", title: "الميزات والمتابعة", collapsible: true, initialVisible: 6 },
  { id: "bottom", pinned: true },
];

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
  brandTitle = "إدارة الجامع",
  children,
}: {
  nav: NavItem[];
  title: string;
  subtitle?: string;
  userLabel?: string;
  onLogout: () => void;
  /** عنوان رأس السايدبار — "إدارة الجامع" افتراضياً */
  brandTitle?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const groups = groupByField(nav, GROUP_DEFS);
  const navProps = {
    groups,
    scope: "mosque",
    isActive: (item: NavItem) => Boolean(item.active),
    headerClass: "text-white/50 hover:text-white/80",
    dividerClass: "border-white/10",
    toggleClass: "text-white/60 hover:text-white",
    renderItem: (item: NavItem) => (
      <Link
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={item.active ? "page" : undefined}
        className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          item.active ? "bg-secondary font-semibold text-on-secondary" : "text-white/70 hover:bg-white/10 hover:text-white"
        }`}
      >
        <span className="shrink-0">{item.icon}</span>
        <span className="flex-1 truncate">{item.label}</span>
        {item.badge}
      </Link>
    ),
  };

  const sidebarContent = (
    <>
      <div className="mb-6 flex items-center justify-between px-2">
        <BrandLockup tone="onDark" context={brandTitle} />
        <button
          onClick={() => setOpen(false)}
          className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <nav aria-label="القائمة الرئيسية" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <GroupedNav {...navProps} />
      </nav>
      <div className="mt-1">
        <GroupedNav {...navProps} pinned />
      </div>

      {userLabel && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary font-naskh text-xs font-bold text-on-secondary">
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
      <div className="mt-2">
        <RoleSwitcher />
      </div>
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
              <h1 className="font-display truncate text-xl font-bold text-foreground">{title}</h1>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
