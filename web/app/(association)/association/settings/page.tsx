"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/mosque/ui";
import { AssociationPage } from "@/components/association/association-page";
import { ThemeToggle } from "@/components/theme-toggle";
import { PasswordChangeForm } from "@/components/password-change-form";
import { DataDeletionCard } from "@/components/data-deletion-card";

type Me = { admin: { username: string } | null; association: { name: string; city: string } | null };

/** إعدادات مدير الجمعية: معلومات الحساب والجمعية فقط (لا واجهة تعديل قائمة لها) */
export default function AssociationSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/association/me")
      .then((res) => res.json() as Promise<Me>)
      .then(setMe)
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/association/logout", { method: "POST" });
    window.location.href = "/association-login";
  }

  return (
    <AssociationPage title="الإعدادات" activeHref="/association/settings">
      <div className="space-y-4">
        <Card className="space-y-1 p-4 text-sm">
          <h2 className="mb-2 text-sm font-semibold">الجمعية والحساب</h2>
          <p>
            الجمعية: {me?.association?.name ?? "—"}
            {me?.association?.city ? ` — ${me.association.city}` : ""}
          </p>
          <p>المستخدم: {me?.admin?.username ?? "—"}</p>
        </Card>
        <PasswordChangeForm endpoint="/api/association/change-password" />
        <ThemeToggle />
        <DataDeletionCard kind="association_admin" />
        <Card className="space-y-3 p-4 text-sm">
          <Link href="/association/help" className="block text-accent-ink underline">كيف أستخدم المنصة؟</Link>
          <Link href="/association/visits" className="block text-accent-ink underline">زيارات المشرف التربوي</Link>
          <button
            type="button"
            onClick={logout}
            className="cursor-pointer rounded-xl border border-destructive bg-destructive-soft px-3 py-1.5 text-sm font-semibold text-destructive"
          >
            تسجيل خروج
          </button>
        </Card>
      </div>
    </AssociationPage>
  );
}
