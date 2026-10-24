"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthCard, AuthShell } from "@/components/auth-shell";
import { UserIcon } from "@/components/icons";

const RESEND_SECONDS = 60;

const inputClass =
  "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10";

const primaryButtonClass =
  "w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-accent/40 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60";

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  /** يطلب رمزاً (إرسال أول أو إعادة) — الرد موحّد من الخادم دائماً */
  async function sendCode(resend: boolean) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إرسال الطلب");
        return;
      }
      setCooldown(RESEND_SECONDS);
      setInfo(data.message ?? "إذا كان البريد مسجّلاً سيصلك رمز");
      if (resend) setCode("");
      setStep("code");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    await sendCode(false);
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) {
      setError("الرمز ٦ أرقام");
      return;
    }
    if (password.length < 8) {
      setError("كلمة المرور ٨ أحرف فأكثر");
      return;
    }
    if (password !== confirm) {
      setError("تأكيد كلمة المرور غير مطابق");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code, password, confirm }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirect?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر تعيين كلمة المرور");
        return;
      }
      // تحميل كامل: القشرة الجديدة تقرأ الجلسة من الخادم من جديد
      window.location.href = data.redirect ?? "/";
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setStep("email");
    setError(null);
    setInfo(null);
    setCode("");
    setPassword("");
    setConfirm("");
  }

  return (
    <AuthShell>
      <h1 className="mb-1 text-center font-display text-3xl font-bold text-white">استرجاع كلمة المرور</h1>
      <p className="mb-6 text-center text-sm text-white/60">
        {step === "email"
          ? "اكتب بريدك، وبنبعث لك رمزاً من ٦ أرقام."
          : "أدخل الرمز اللي وصلك على بريدك، ثم كلمة مرور جديدة."}
      </p>

      <AuthCard>
        {step === "email" ? (
          <form onSubmit={submitEmail} className="space-y-3">
            <label className="block text-sm">
              <span className="text-xs text-white/60">البريد الإلكتروني</span>
              <div className="relative">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className={`${inputClass} pr-11`}
                />
                <UserIcon size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              </div>
            </label>
            {error && <p className="text-sm text-destructive-light">{error}</p>}
            <button type="submit" disabled={busy} className={primaryButtonClass} style={{ backgroundColor: "var(--color-secondary)", color: "var(--color-on-secondary)" }}>
              {busy ? "لحظة…" : "أرسل الرمز"}
            </button>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-3">
            {info && <p className="text-center text-xs text-success">{info}</p>}
            <p className="text-center text-xs text-white/60" dir="ltr">
              {email}
            </p>
            <label className="block text-sm">
              <span className="text-xs text-white/60">الرمز المكوّن من ٦ أرقام</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required
                className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-white/60">كلمة المرور الجديدة</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className={inputClass}
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs text-white/60">تأكيد كلمة المرور</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className={inputClass}
              />
            </label>
            {error && <p className="text-sm text-destructive-light">{error}</p>}
            <button type="submit" disabled={busy} className={primaryButtonClass} style={{ backgroundColor: "var(--color-secondary)", color: "var(--color-on-secondary)" }}>
              {busy ? "لحظة…" : "حفظ كلمة المرور والدخول"}
            </button>
            <div className="flex items-center justify-between gap-3 pt-1 text-xs">
              <button
                type="button"
                onClick={() => sendCode(true)}
                disabled={busy || cooldown > 0}
                className="cursor-pointer text-white/70 hover:text-white hover:underline disabled:cursor-not-allowed disabled:text-white/40 disabled:no-underline"
              >
                {cooldown > 0 ? `إعادة إرسال الرمز (${cooldown})` : "إعادة إرسال الرمز"}
              </button>
              <button type="button" onClick={back} className="cursor-pointer text-white/70 hover:text-white hover:underline">
                تغيير البريد
              </button>
            </div>
          </form>
        )}
        <Link href="/" className="mt-4 block text-center text-xs text-white/60 hover:text-white hover:underline">
          الرجوع لتسجيل الدخول
        </Link>
      </AuthCard>
    </AuthShell>
  );
}
