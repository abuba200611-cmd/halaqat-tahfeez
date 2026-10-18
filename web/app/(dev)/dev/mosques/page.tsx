"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { callApi, useApi } from "@/components/mosque/use-api";

type MosqueCard = {
  id: number;
  name: string;
  city: string;
  createdAt: string;
  halaqahs: { id: number; name: string; teacher: string }[];
  adminUsername: string | null;
  features: { key: string; nameAr: string; enabled: boolean; status: string }[];
};

export default function DevMosquesPage() {
  const { data, loading, reload } = useApi<{ mosques: MosqueCard[] }>("/api/dev/mosques");
  const mosques = data?.mosques ?? null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">الجوامع</h1>
        <p className="text-sm text-muted-foreground">إنشاء الجوامع، حلقاتها، حساب مديرها، ومصفوفة مزاياها.</p>
      </div>
      <CreateMosqueCard onCreated={reload} />
      {loading && !mosques && <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>}
      {mosques?.map((mosque) => <MosqueRow key={mosque.id} mosque={mosque} onChanged={reload} />)}
    </div>
  );
}

function CreateMosqueCard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // نفس مسار الإنشاء القائم — بلا ازدواج
      const result = await callApi("/api/mosques", "POST", { name, city });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setCity("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">إضافة جامع جديد</h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اسم الجامع"
          required
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="المدينة (اختياري)"
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "لحظة…" : "إضافة"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

function MosqueRow({ mosque, onChanged }: { mosque: MosqueCard; onChanged: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="cursor-pointer text-right">
          <p className="font-semibold">
            {mosque.name} <span className="text-xs font-normal text-muted-foreground">#{mosque.id}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {mosque.city ? `${mosque.city} · ` : ""}
            {mosque.halaqahs.length} حلقة
            {mosque.adminUsername ? ` · مدير: ${mosque.adminUsername}` : " · بلا حساب مدير"}
          </p>
        </button>
        <div className="flex items-center gap-2">
          <a href={`/mosque/${mosque.id}`} target="_blank" rel="noreferrer">
            <Button variant="ghost" type="button">
              فتح لوحة الجامع ↗
            </Button>
          </a>
          <Button variant="ghost" type="button" onClick={() => setOpen((v) => !v)}>
            {open ? "إخفاء" : "التفاصيل"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div>
            <h3 className="mb-2 text-sm font-semibold">الحلقات المرتبطة</h3>
            {mosque.halaqahs.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا حلقات مرتبطة بعد.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {mosque.halaqahs.map((h) => (
                  <li key={h.id}>
                    <Badge>
                      {h.name}
                      {h.teacher ? ` — ${h.teacher}` : ""}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <AdminAccountCard mosque={mosque} />
          <FeatureMatrix mosque={mosque} onChanged={onChanged} />
        </div>
      )}
    </Card>
  );
}

function AdminAccountCard({ mosque }: { mosque: MosqueCard }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      // نفس مسار إنشاء/استبدال حساب المدير القائم
      const result = await callApi(`/api/mosques/${mosque.id}/admin-account`, "POST", { username, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUsername("");
      setPassword("");
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">
        حساب المدير {mosque.adminUsername ? `(الحالي: ${mosque.adminUsername})` : "(لا يوجد)"}
      </h3>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="اسم المستخدم"
          required
          dir="ltr"
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة المرور (٨+)"
          type="password"
          required
          dir="ltr"
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "لحظة…" : mosque.adminUsername ? "استبدال" : "إنشاء"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {done && <p className="mt-2 text-sm text-primary">حُفظ الحساب الجديد.</p>}
    </div>
  );
}

function FeatureMatrix({ mosque, onChanged }: { mosque: MosqueCard; onChanged: () => void }) {
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function toggle(key: string, enabled: boolean) {
    setBusyKey(key);
    try {
      // نفس مسار التبديل القائم — يكتب سجل التدقيق من هناك
      await callApi(`/api/mosques/${mosque.id}/features`, "PATCH", { key, enabled });
      onChanged();
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">مصفوفة المزايا</h3>
      <ul className="divide-y divide-border rounded-md border border-border">
        {mosque.features.map((feature) => (
          <li key={feature.key} className="flex items-center justify-between gap-2 px-3 py-2">
            <div>
              <p className="text-sm font-medium">{feature.nameAr}</p>
              <p className="text-xs text-muted-foreground">{feature.status === "soon" ? "قريباً — لا يمكن تفعيلها" : feature.key}</p>
            </div>
            {feature.status === "soon" ? (
              <Badge tone="warn">قريباً</Badge>
            ) : (
              <button
                type="button"
                disabled={busyKey === feature.key}
                onClick={() => toggle(feature.key, !feature.enabled)}
                className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200 disabled:opacity-50 ${
                  feature.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}
              >
                {feature.enabled ? "مفعّلة ✓" : "معطّلة"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
