"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, Empty, Stat } from "@/components/mosque/ui";
import { DashboardShell } from "@/components/mosque/shell";
import { BuildingIcon, HomeIcon, PlusIcon, SettingsIcon } from "@/components/mosque/icons";

type Mosque = { id: number; name: string; city: string; createdAt: string };

export default function HomePage() {
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((data: { admin: boolean }) => setAdmin(data.admin))
      .catch(() => setAdmin(false));
  }, []);

  if (admin === null) return <Empty title="جارٍ التحقق…" />;
  if (!admin) return <AdminLogin onIn={() => setAdmin(true)} />;
  return <Dashboard onLoggedOut={() => setAdmin(false)} />;
}

function AdminLogin({ onIn }: { onIn: () => void }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        setError("كلمة السر غير صحيحة");
        return;
      }
      onIn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-center font-display text-2xl font-bold text-primary">إدارة الجامع</h1>
      <p className="mb-5 text-center text-sm text-muted-foreground">
        تنظيم الحلقات وتوزيع الطلاب الجدد
      </p>
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="كلمة السر"
            autoFocus
            required
            className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "لحظة…" : "دخول"}
          </Button>
        </form>
      </Card>
      <Link href="/mosque-login" className="mt-4 text-center text-xs text-muted-foreground hover:text-foreground">
        مدير جامع؟ سجّل دخولك من هنا
      </Link>
    </main>
  );
}

function Dashboard({ onLoggedOut }: { onLoggedOut: () => void }) {
  const [mosques, setMosques] = useState<Mosque[] | null>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    fetch("/api/mosques")
      .then((res) => res.json())
      .then((data: { mosques?: Mosque[] }) => setMosques(data.mosques ?? []))
      .catch(() => setMosques([]));
  }

  useEffect(load, []);

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    onLoggedOut();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mosques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر الإضافة");
        return;
      }
      setName("");
      setCity("");
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardShell
      nav={[
        { href: "/mosque", label: "الرئيسية", icon: <HomeIcon />, active: true, group: "top" },
        { href: "/mosque/settings", label: "الإعدادات", icon: <SettingsIcon />, group: "bottom" },
      ]}
      title="أهلاً بك 👋"
      subtitle="نظرة عامة على كل الجوامع اللي تديرها"
      userLabel="المشرف العام"
      onLogout={logout}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat
            label="عدد الجوامع"
            value={mosques?.length ?? "—"}
            icon={<BuildingIcon className="h-4 w-4" />}
            tone="primary"
          />
          <Card className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-semibold">إضافة جامع جديد</p>
              <p className="text-xs text-muted-foreground">اسم الجامع كافٍ للبدء</p>
            </div>
            <PlusIcon className="h-5 w-5 text-primary" />
          </Card>
        </div>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">إضافة جامع جديد</h2>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم الجامع"
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="المدينة (اختياري)"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <Button type="submit" disabled={busy}>
              {busy ? "لحظة…" : "إضافة"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </Card>

        <div>
          <h2 className="mb-3 font-display text-lg font-bold">الجوامع</h2>
          {mosques === null ? (
            <Empty title="جارٍ التحميل…" />
          ) : mosques.length === 0 ? (
            <Empty title="ما فيه جوامع بعد — أضف أول واحد فوق." />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {mosques.map((m) => (
                <li key={m.id}>
                  <Link href={`/mosque/${m.id}`}>
                    <Card className="flex items-center gap-3 p-4 transition-shadow duration-200 hover:shadow-[0_4px_14px_rgba(19,78,74,0.08)]">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <BuildingIcon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{m.name}</p>
                        {m.city && <p className="truncate text-xs text-muted-foreground">{m.city}</p>}
                      </div>
                      <span className="text-sm text-primary">←</span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
