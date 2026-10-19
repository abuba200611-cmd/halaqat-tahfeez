"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, Empty } from "@/components/mosque/ui";
import { DashboardShell } from "@/components/mosque/shell";
import { HomeIcon, SettingsIcon } from "@/components/mosque/icons";
import { ThemeToggle } from "@/components/theme-toggle";

type Mosque = { id: number; name: string; city: string };

/** إعدادات المشرف العام: الحساب + روابط لإعدادات ومزايا كل جامع (الصفحات القائمة) */
export default function MosqueRootSettingsPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [mosques, setMosques] = useState<Mosque[]>([]);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((d: { admin: boolean }) => {
        setAdmin(d.admin);
        if (d.admin) {
          fetch("/api/mosques")
            .then((r) => r.json())
            .then((m: { mosques?: Mosque[] }) => setMosques(m.mosques ?? []))
            .catch(() => {});
        }
      })
      .catch(() => setAdmin(false));
  }, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/mosque";
  }

  if (admin === null) return <Empty title="جارٍ التحقق…" />;
  if (!admin) {
    return (
      <main className="mx-auto w-full max-w-sm px-4 py-10 text-center text-sm">
        <Link href="/mosque" className="text-accent-ink underline">سجّل دخولك أولاً</Link>
      </main>
    );
  }

  return (
    <DashboardShell
      nav={[
        { href: "/mosque", label: "الرئيسية", icon: <HomeIcon />, group: "top" },
        { href: "/mosque/settings", label: "الإعدادات", icon: <SettingsIcon />, active: true, group: "bottom" },
      ]}
      title="الإعدادات"
      subtitle="الحساب وإعدادات الجوامع"
      userLabel="المشرف العام"
      onLogout={logout}
    >
      <div className="space-y-4">
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">إعدادات ومزايا كل جامع</h2>
          {mosques.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا جوامع بعد.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {mosques.map((m) => (
                <li key={m.id}>
                  <Link href={`/mosque/${m.id}/settings`} className="text-accent-ink underline">
                    {m.name}
                    {m.city ? ` — ${m.city}` : ""}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <ThemeToggle />
        <Card className="p-4">
          <h2 className="mb-2 text-sm font-semibold">الحساب</h2>
          <button
            type="button"
            onClick={logout}
            className="cursor-pointer rounded-xl border border-destructive bg-destructive-soft px-3 py-1.5 text-sm font-semibold text-destructive"
          >
            تسجيل خروج
          </button>
        </Card>
      </div>
    </DashboardShell>
  );
}
