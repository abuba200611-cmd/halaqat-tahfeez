"use client";

import Link from "next/link";
import { useParentSession } from "@/components/parent-shell";
import { ParentPushToggle } from "@/components/parent-push-toggle";
import { ParentWhatsappCard } from "@/components/parent-whatsapp-card";
import { ThemeToggle } from "@/components/theme-toggle";
import { ProfileNameForm } from "@/components/profile-name-form";
import { PasswordChangeForm } from "@/components/password-change-form";
import { DataDeletionCard } from "@/components/data-deletion-card";

const CARD = "rounded-2xl border border-stone-200 bg-white p-4";

/** إعدادات ولي الأمر — تجمع الإشعارات وواتساب والحساب من مكوّنات قائمة */
export default function ParentSettingsPage() {
  const { parent, checking, logout } = useParentSession();

  if (checking) return <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>;
  if (!parent) {
    return (
      <p className="text-sm">
        سجّل دخولك أولاً من{" "}
        <Link href="/parent/login" className="font-semibold text-accent-ink underline">صفحة الدخول</Link>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="font-display text-xl font-bold text-stone-800">الإعدادات</h1>
      <div className={CARD}>
        <h2 className="mb-2 text-sm font-semibold text-stone-700">إشعارات هذا الجهاز</h2>
        <ParentPushToggle />
      </div>
      <ParentWhatsappCard />
      <div className={CARD}>
        <h2 className="mb-2 text-sm font-semibold text-stone-700">الحساب</h2>
        <p className="mb-3 text-sm text-stone-500">{parent.name} — {parent.email}</p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/parent/help" className="font-semibold text-accent-ink underline">كيف أستخدم المنصة؟</Link>
          <Link href="/parent/suggest" className="font-semibold text-accent-ink underline">اقتراح / بلاغ</Link>
          <button
            type="button"
            onClick={logout}
            className="cursor-pointer rounded-xl border border-destructive bg-destructive-soft px-3 py-1.5 text-sm font-semibold text-destructive"
          >
            تسجيل خروج
          </button>
        </div>
      </div>
      <ProfileNameForm key={parent.name} endpoint="/api/parent-auth/profile" initialName={parent.name} />
      <PasswordChangeForm endpoint="/api/parent-auth/change-password" />
      <DataDeletionCard kind="parent" />
      <ThemeToggle />
    </div>
  );
}
