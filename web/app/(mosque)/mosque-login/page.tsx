"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard, AuthShell } from "@/components/auth-shell";
import { BrandLockup } from "@/components/brand";
import { EyeIcon, EyeOffIcon, UserIcon } from "@/components/icons";

const field =
  "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10";

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** طلب تسجيل معلّق أو مرفوض: رسالة حالة لا خطأ بيانات */
  const [requestState, setRequestState] = useState<"pending" | "rejected" | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setRequestState(null);
    try {
      const res = await fetch("/api/mosque-admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (data.code === "registration_pending") setRequestState("pending");
        else if (data.code === "registration_rejected") setRequestState("rejected");
        setError(data.error ?? "بيانات الدخول غير صحيحة");
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
    <AuthShell>
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onDark" href="/welcome" />
      </div>
      <h1 className="font-display mb-2 pb-1 text-center text-2xl font-black leading-[1.35] text-white">دخول مدير الجامع</h1>
      <p className="mb-6 text-center text-sm leading-relaxed text-white/60">إدارة حلقات جامعك وتوزيع طلابه الجدد</p>

      <AuthCard>
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-xs text-white/60">اسم المستخدم</span>
            <div className="relative">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                dir="ltr"
                className={`${field} text-left`}
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

          {error && requestState ? (
            <p
              role="status"
              className={`rounded-xl border px-3 py-2.5 text-sm leading-[1.8] ${
                requestState === "pending" ? "border-secondary/50 bg-secondary/10 text-sand" : "border-destructive-light/50 text-destructive-light"
              }`}
            >
              {error}
            </p>
          ) : (
            error && (
              <p role="alert" className="text-sm leading-relaxed text-destructive-light">
                {error}
              </p>
            )
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold shadow-lg transition-shadow duration-200 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--color-secondary)", color: "#000000" }}
          >
            {busy ? "لحظة…" : "دخول"}
          </button>
        </form>

        <div className="mt-4 space-y-1.5 text-center text-xs leading-relaxed text-white/60">
          <p>
            ما عندك حساب؟{" "}
            <Link href="/register-mosque" className="font-semibold text-white hover:underline">
              سجّل جامعك
            </Link>
          </p>
          <p>
            أنت معلّم؟{" "}
            <Link href="/login" className="font-semibold text-white hover:underline">
              دخول المعلّمين
            </Link>
            {" · "}
            ولي أمر؟{" "}
            <Link href="/parent/login" className="font-semibold text-white hover:underline">
              دخول أولياء الأمور
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}
