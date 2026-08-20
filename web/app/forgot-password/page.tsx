"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إرسال الطلب");
        return;
      }
      setSent(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-center font-naskh text-2xl font-bold text-primary">استرجاع كلمة المرور</h1>
      <p className="mb-5 text-center text-sm text-muted-foreground">
        اكتب بريدك، وبنبعث لك رابط تعيين كلمة مرور جديدة.
      </p>

      <Card className="p-5">
        {sent ? (
          <p className="text-center text-sm text-success">
            لو هذا البريد مسجّل، وصلته رسالة الآن — تفقّد بريدك.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">البريد الإلكتروني</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? "لحظة…" : "إرسال رابط الاسترجاع"}
            </Button>
          </form>
        )}
        <Link href="/" className="mt-4 block text-center text-xs text-muted-foreground hover:text-foreground">
          الرجوع لتسجيل الدخول
        </Link>
      </Card>
    </main>
  );
}
