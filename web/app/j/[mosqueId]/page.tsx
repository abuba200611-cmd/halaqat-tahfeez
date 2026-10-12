"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card } from "@/components/mosque/ui";

export default function JoinPage() {
  const params = useParams<{ mosqueId: string }>();
  const mosqueId = Number(params.mosqueId);

  const [mosqueName, setMosqueName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/mosques/${mosqueId}/public`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { name?: string } | null) => {
        if (d?.name) setMosqueName(d.name);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [mosqueId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mosqueId, name, phone }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر التسجيل");
        return;
      }
      setDone(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <p className="text-sm text-destructive">رابط التسجيل غير صحيح.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-center font-naskh text-2xl font-bold text-primary">تسجيل طالب جديد</h1>
      {mosqueName && (
        <p className="mb-5 text-center text-sm text-muted-foreground">
          تسجّل بـ<span className="font-semibold text-foreground"> {mosqueName}</span>
        </p>
      )}

      <Card className="p-5">
        {done ? (
          <p className="text-center text-sm text-success">
            تم استلام تسجيلك ✓ راح يتواصلون معك بعد ما يوزّعونك على حلقة.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">الاسم</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسمك الكامل"
                required
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">رقم الجوال</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                type="tel"
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || !mosqueName} className="w-full">
              {busy ? "لحظة…" : "تسجيل"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
