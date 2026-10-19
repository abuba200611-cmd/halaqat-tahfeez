"use client";

import { BackButton } from "@/components/back-button";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card } from "@/components/mosque/ui";
import { BrandLockup } from "@/components/brand";

export default function JoinPage() {
  const params = useParams<{ mosqueId: string }>();
  const mosqueId = Number(params.mosqueId);

  const [mosqueName, setMosqueName] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);

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
        body: JSON.stringify({ mosqueId, name, phone, birthYear: birthYear.trim() || null, level: level || null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; waitlisted?: boolean };
      if (!res.ok) {
        setError(data.error ?? "تعذّر التسجيل");
        return;
      }
      setWaitlisted(data.waitlisted === true);
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
      <BackButton className="mb-3 self-start" />
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onLight" size={44} />
      </div>
      <h1 className="font-display mb-1 text-center text-2xl font-bold text-primary">تسجيل طالب جديد</h1>
      {mosqueName && (
        <p className="mb-5 text-center text-sm text-muted-foreground">
          تسجّل بـ<span className="font-semibold text-foreground"> {mosqueName}</span>
        </p>
      )}

      <Card className="p-5">
        {done ? (
          <p className="text-center text-sm text-success">
            {waitlisted
              ? "تم استلام تسجيلك ✓ الحلقات ممتلئة حالياً وأُضفت لقائمة الانتظار، وراح يتواصلون معك عند توفّر مقعد."
              : "تم استلام تسجيلك ✓ راح يتواصلون معك بعد ما يوزّعونك على حلقة."}
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
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">سنة الميلاد (اختياري)</span>
              <input
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value)}
                placeholder="2014"
                inputMode="numeric"
                maxLength={4}
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">المستوى (اختياري)</span>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <option value="">غير محدد</option>
                <option value="beginner">مبتدئ</option>
                <option value="intermediate">متوسط</option>
                <option value="advanced">متقدم</option>
              </select>
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
