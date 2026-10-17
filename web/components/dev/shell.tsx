"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RoleSwitcher } from "../role-switcher";

/*
  قالب لوحة المطوّر — سايدبار داكن خاص بهذه اللوحة وحدها (مستقل عن قالب
  الجامع الفاتح). على الجوال يتحول لشريط علوي أفقي قابل للتمرير.
*/

const NAV = [
  { href: "/dev", label: "نظرة عامة", icon: "📊" },
  { href: "/dev/mosques", label: "الجوامع", icon: "🕌" },
  { href: "/dev/associations", label: "الجمعيات", icon: "🏛️" },
  { href: "/dev/users", label: "المستخدمون", icon: "👥" },
  { href: "/dev/reports", label: "البلاغات", icon: "📮" },
  { href: "/dev/health", label: "الصحة", icon: "🩺" },
  { href: "/admin", label: "الاقتراحات", icon: "💡" },
  { href: "/dev/agent-lessons", label: "دروس الإيجنت", icon: "🤖" },
  { href: "/dev/audit", label: "سجل التدقيق", icon: "🧾" },
];

export function DevShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      window.location.href = "/admin";
    } finally {
      setBusy(false);
    }
  }

  const links = (vertical: boolean) =>
    NAV.map((item) => {
      const active = vertical && (pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)));
      return (
        <Link
          key={item.href}
          href={item.href}
          className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-200 ${
            active ? "bg-white/10 font-semibold text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span aria-hidden>{item.icon}</span>
          <span className={vertical ? "" : "md:hidden"}>{item.label}</span>
        </Link>
      );
    });

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* الجوال: شريط علوي */}
      <header className="flex items-center gap-3 bg-slate-950 px-3 py-2 md:hidden">
        <p className="font-naskh text-sm font-bold text-white">لوحة المطوّر</p>
        <nav className="flex flex-1 gap-1 overflow-x-auto">{links(false)}</nav>
      </header>

      {/* الشاشات الواسعة: سايدبار داكن */}
      <aside className="hidden w-56 shrink-0 flex-col bg-slate-950 px-3 py-5 md:flex">
        <div className="mb-6 px-2">
          <p className="font-naskh text-lg font-bold text-white">لوحة المطوّر</p>
          <p className="text-xs text-white/50">MOS — نظام تشغيل الجامع</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">{links(true)}</nav>
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

      <main className="min-w-0 flex-1 bg-background px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
