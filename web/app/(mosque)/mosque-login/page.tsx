"use client";

import { BrandLockup } from "@/components/brand";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@/components/mosque/ui";

export default function MosqueLoginPage() {
  return (
    <Suspense fallback={null}>
      <MosqueLoginInner />
    </Suspense>
  );
}

/** يقرأ ?username= (تعبئة مسبقة من مبدّل الأدوار عند تحويل المستخدم لإثبات كلمة مرور المدير) */
function MosqueLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState(searchParams.get("username") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mosque-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("بيانات الدخول غير صحيحة");
        return;
      }
      const me = await fetch("/api/mosque-admin/me").then((r) => r.json());
      if (me.admin) router.push(`/mosque/${me.admin.mosqueId}`);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onLight" size={44} />
      </div>
      <h1 className="font-display mb-1 text-center text-2xl font-bold text-primary">دخول مدير الجامع</h1>
      <p className="mb-5 text-center text-sm text-muted-foreground">
        إدارة حلقات جامعك وتوزيع طلابه الجدد
      </p>
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">اسم المستخدم</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">كلمة المرور</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "لحظة…" : "دخول"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
