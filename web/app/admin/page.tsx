"use client";

import { BackButton } from "@/components/back-button";
import { useEffect, useState } from "react";
import { Button, Card, Empty } from "@/components/ui";
import { BrandLockup } from "@/components/brand";

// /admin صار بوابة دخول فقط: الاقتراحات قسم داخل لوحة المطوّر بقائمتها الجانبية
export default function AdminPage() {
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    fetch("/api/admin/suggestions")
      .then((res) => {
        if (res.status === 401) setNeedsLogin(true);
        else window.location.replace("/dev/suggestions");
      })
      .catch(() => setNeedsLogin(true));
  }, []);

  if (needsLogin) return <AdminLogin onIn={async () => {}} />;
  return <Empty title="جارٍ التحميل…" />;
}

function AdminLogin({ onIn }: { onIn: () => Promise<void> }) {
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
        // نعرض رسالة الخادم كما هي حتى لا يختلط «محاولات كثيرة» بـ«كلمة سر خاطئة»
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "كلمة السر غير صحيحة");
        return;
      }
      // بعد الدخول نفتح لوحة المطوّر نفسها، والاقتراحات قسم داخلها
      window.location.assign("/dev");
      await onIn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <BackButton className="mb-3 self-start" />
      <Card className="p-5">
        <div className="mb-4 flex justify-center">
          <BrandLockup tone="onLight" size={44} />
        </div>
        <h1 className="font-display mb-4 text-center text-xl font-bold">لوحة المطوّر</h1>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="كلمة السر"
            autoFocus
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "لحظة…" : "دخول"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
