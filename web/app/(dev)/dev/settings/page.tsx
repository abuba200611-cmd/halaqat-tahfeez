"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

const CARD = "rounded-2xl border border-border bg-surface p-4";

/** إعدادات لوحة المطوّر: الجلسة والروابط السريعة لصفحات النظام القائمة */
export default function DevSettingsPage() {
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

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">الإعدادات</h1>
      <div className={CARD}>
        <h2 className="mb-2 text-sm font-semibold">النظام</h2>
        <ul className="space-y-1.5 text-sm">
          <li><Link href="/dev/health" className="text-accent-ink underline">صحة النظام</Link></li>
          <li><Link href="/dev/audit" className="text-accent-ink underline">سجل التدقيق</Link></li>
          <li><Link href="/dev/mosques" className="text-accent-ink underline">الجوامع ومزاياها</Link></li>
        </ul>
      </div>
      <ThemeToggle />
      <div className={CARD}>
        <h2 className="mb-2 text-sm font-semibold">الجلسة</h2>
        <button
          type="button"
          onClick={logout}
          disabled={busy}
          className="cursor-pointer rounded-xl border border-destructive bg-destructive-soft px-3 py-1.5 text-sm font-semibold text-destructive disabled:opacity-50"
        >
          {busy ? "…" : "تسجيل خروج"}
        </button>
      </div>
    </div>
  );
}
