"use client";

import { useState } from "react";
import { useParentSession, type ParentSession } from "./parent-shell";

/**
 * نموذج دخول/إنشاء حساب ولي الأمر (STEP 61) — مشترك بين /parent/login
 * و/parent/join. بعد النجاح يحدّث سياق الجلسة ويستدعي onDone.
 * initialEmail تعبئة مسبقة فقط (من مبدّل الأدوار M5).
 */
export function ParentAuthForm({
  initialMode = "login",
  initialEmail = "",
  onDone,
}: {
  initialMode?: "login" | "register";
  initialEmail?: string;
  onDone?: (parent: ParentSession) => void;
}) {
  const { setParent } = useParentSession();
  const [mode, setMode] = useState<"login" | "register">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(mode === "login" ? "/api/parent-auth/login" : "/api/parent-auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { name, email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; parent?: ParentSession };
      if (!res.ok || !data.parent) {
        setError(data.error ?? "تعذّر إكمال الطلب");
        return;
      }
      setParent(data.parent);
      onDone?.(data.parent);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex gap-1 rounded-xl bg-stone-100 p-1 text-sm font-semibold">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            className={`flex-1 cursor-pointer rounded-lg py-1.5 ${
              mode === m ? "bg-white text-accent-ink shadow-sm" : "text-stone-500"
            }`}
          >
            {m === "login" ? "تسجيل الدخول" : "حساب جديد"}
          </button>
        ))}
      </div>

      {mode === "register" && (
        <label className="block text-sm text-stone-600">
          الاسم
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={`${input} mt-1`} />
        </label>
      )}
      <label className="block text-sm text-stone-600">
        البريد الإلكتروني
        <input
          type="email"
          dir="ltr"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={`${input} mt-1 text-left`}
        />
      </label>
      <label className="block text-sm text-stone-600">
        كلمة المرور {mode === "register" && <span className="text-xs text-stone-400">(٨ أحرف على الأقل)</span>}
        <input
          type="password"
          dir="ltr"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={mode === "register" ? 8 : undefined}
          className={`${input} mt-1 text-left`}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="w-full cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "لحظة…" : mode === "login" ? "دخول" : "إنشاء الحساب"}
      </button>
    </form>
  );
}
