"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard, AuthShell } from "@/components/auth-shell";
import { EyeIcon, EyeOffIcon, UserIcon } from "@/components/icons";

/*
  M5 — صفحة الدخول الموحّدة لنظام MOS: نموذج واحد يجرّب المُصدِّقات
  القديمة بترتيب ثابت (معلّم ← مدير جامع ← ولي أمر) عبر /api/login، فيضبط
  كوكي النوع المتطابق كما هو. الطالب له سياق حلقته الخاص فرابطه منفصل،
  وزر جوجل يبقى كما اليوم للمعلّمين. صفحات الدخول القديمة كلها تعمل كما
  هي — هذه بديل موحّد لا إلغاء.
*/

const field =
  "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10";

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-2.1 14.2-5.5l-6.6-5.6c-2 1.5-4.6 2.4-7.6 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.6 5.1C9.6 39.6 16.3 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.6 5.6C41.4 36.5 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

function UnifiedLoginForm() {
  const searchParams = useSearchParams();
  const [identifier, setIdentifier] = useState(() => searchParams.get("identifier") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (error) window.history.replaceState(null, "", "/login");
  }, [error]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { kind?: string; redirect?: string; error?: string };
      if (!res.ok || !data.kind) {
        setError(data.error ?? "تعذّر تسجيل الدخول");
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

  return (
    <AuthShell>
      <h1 className="mb-1 text-center font-naskh text-3xl font-bold text-white">MOS</h1>
      <p className="mb-6 text-center text-sm text-white/60">نظام تشغيل الجامع — دخول واحد لكل أدوارك</p>

      <AuthCard>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-xs text-white/60">البريد الإلكتروني أو اسم المستخدم</span>
            <div className="relative">
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                autoComplete="username"
                required
                className={field}
              />
              <UserIcon size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            </div>
          </label>

          <label className="block text-sm">
            <span className="text-xs text-white/60">كلمة المرور</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={field}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer text-white/50 transition-colors duration-200 hover:text-white"
                aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
              >
                {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
              </button>
            </div>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-orange-500/40 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #F97316, #EF4444)" }}
          >
            {busy ? "لحظة…" : "دخول"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-white/40">
          <span className="h-px flex-1 bg-white/15" />
          أو
          <span className="h-px flex-1 bg-white/15" />
        </div>

        <a
          href="/api/auth/google/start"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/10"
        >
          <GoogleIcon />
          الدخول بحساب جوجل (معلّم)
        </a>

        <div className="mt-4 space-y-1 text-center text-xs text-white/60">
          <p>
            أنت طالب؟{" "}
            <Link href="/student" className="font-semibold text-white hover:underline">
              دخول الطالب
            </Link>
          </p>
          <p>
            نسيت كلمة المرور؟{" "}
            <Link href="/forgot-password" className="font-semibold text-white hover:underline">
              استرجاع كلمة المرور
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}

export default function UnifiedLoginPage() {
  return (
    <Suspense fallback={null}>
      <UnifiedLoginForm />
    </Suspense>
  );
}
