"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthShell } from "@/components/auth-shell";
import { UserIcon } from "@/components/icons";

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
    <AuthShell>
      <h1 className="mb-1 text-center font-naskh text-3xl font-bold text-white">استرجاع كلمة المرور</h1>
      <p className="mb-6 text-center text-sm text-white/60">اكتب بريدك، وبنبعث لك رابط تعيين كلمة مرور جديدة.</p>

      <AuthCard>
        {sent ? (
          <p className="text-center text-sm text-emerald-400">لو هذا البريد مسجّل، وصلته رسالة الآن — تفقّد بريدك.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">
              <span className="text-xs text-white/60">البريد الإلكتروني</span>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10"
                />
                <UserIcon size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              </div>
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-orange-500/40 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: "linear-gradient(90deg, #F97316, #EF4444)" }}
            >
              {busy ? "لحظة…" : "إرسال رابط الاسترجاع"}
            </button>
          </form>
        )}
        <Link href="/" className="mt-4 block text-center text-xs text-white/60 hover:text-white hover:underline">
          الرجوع لتسجيل الدخول
        </Link>
      </AuthCard>
    </AuthShell>
  );
}
