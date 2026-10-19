"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuthCard, AuthShell } from "./auth-shell";
import { BrandLockup } from "./brand";
import { EyeIcon, EyeOffIcon, UserIcon } from "./icons";

/*
  شاشة دخول/تسجيل المعلّم — استُخرجت من auth-gate.tsx (L1) لتُعرض في
  موضعين: شاشة AuthGate لغير المسجّل داخل تطبيق المعلّم، وصفحة /signup
  العامة لبدء التسجيل من الصفحة الترحيبية. النموذج نفسه بلا تكرار.
*/

export type TeacherAuthUser = {
  id: number;
  username: string;
  teacherName: string;
  halaqahId: number;
  halaqahName: string;
  role: "supervisor" | "assistant";
  emailVerified: boolean;
};

/*
  أول زيارة، الجهاز ما عنده حساب بعد — عرض تبويب "تسجيل الدخول" مربك (يطلب
  دخول لحساب مو موجود). نتذكّر بمتصفّح الجهاز إذا سبق أنشأ/سجّل دخول حساب،
  ونعرض النمط المناسب افتراضياً بدل تبويبين متساويين من البداية.
*/
const KNOWN_ACCOUNT_KEY = "halaqat_known_account";

export function markAccountKnown() {
  try {
    window.localStorage.setItem(KNOWN_ACCOUNT_KEY, "1");
  } catch {
    // localStorage قد يكون معطّلاً (وضع خاص) — لا يوقف تسجيل الدخول
  }
}

export function TeacherAuthScreen({
  initialMode,
  onAuthenticated,
}: {
  /** يفرض النمط الافتراضي؛ بدونها يُشتق من رابط الدعوة وذاكرة الجهاز */
  initialMode?: "login" | "register";
  onAuthenticated: (teacher: TeacherAuthUser) => void;
}) {
  // رابط دعوة معلّم زميل (?join=رمز) — يفرض وضع "حساب جديد" وينضم كمساعد
  // مشرف لحلقة قائمة بدل إنشاء حلقة جديدة.
  const [joinCode] = useState<string>(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("join") ?? "",
  );
  const [joinHalaqah, setJoinHalaqah] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">(() => {
    if (initialMode) return initialMode;
    if (typeof window === "undefined") return "register";
    if (new URLSearchParams(window.location.search).get("join")) return "register";
    try {
      return window.localStorage.getItem(KNOWN_ACCOUNT_KEY) ? "login" : "register";
    } catch {
      return "register";
    }
  });
  const [username, setUsername] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("email") ?? "",
  );
  const [password, setPassword] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [halaqahName, setHalaqahName] = useState("");
  const [error, setError] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("googleError"),
  );
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // كود يفسّر الخطأ فيعرض زراً مناسباً: لا حساب بالبريد، أو البريد مسجّل مسبقاً
  const [errorCode, setErrorCode] = useState<"no_account" | "account_exists" | null>(null);
  // تسليم جوجل (بريد/اسم موثّقان من جوجل بكوكي موقّع) — يُفعَّل عند ?google=1
  const [googleHandoff, setGoogleHandoff] = useState(false);

  useEffect(() => {
    if (error) window.history.replaceState(null, "", window.location.pathname);
  }, [error]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("google") !== "1") return;
    fetch("/api/auth/google/handoff")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { email?: string; name?: string } | null) => {
        if (!data?.email) {
          setError("انتهت صلاحية التحقق من جوجل — اضغط «الدخول بحساب جوجل» من جديد");
          return;
        }
        setGoogleHandoff(true);
        setMode("register");
        setUsername(data.email);
        setTeacherName((current) => current || data.name || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!joinCode) return;
    fetch(`/api/teacher/join-info?code=${encodeURIComponent(joinCode)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { halaqahName?: string } | null) => {
        if (data?.halaqahName) setJoinHalaqah(data.halaqahName);
      })
      .catch(() => {});
  }, [joinCode]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // مع تسليم جوجل يعتمد الخادم بريده من الكوكي الموقّع لا من هنا
          username,
          password: googleHandoff ? undefined : password,
          teacherName,
          halaqahName,
          joinCode: mode === "register" ? joinCode : undefined,
          googleHandoff: mode === "register" && googleHandoff ? true : undefined,
        }),
      });
      const data = (await res.json()) as {
        teacher?: TeacherAuthUser;
        error?: string;
        message?: string;
        code?: string;
      };
      if (!res.ok || !data.teacher) {
        setError(data.error ?? data.message ?? "تعذّر إتمام العملية");
        if (data.code === "no_account" || data.code === "account_exists") setErrorCode(data.code);
        return;
      }
      markAccountKnown();
      onAuthenticated(data.teacher);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10";

  return (
    <AuthShell>
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onDark" href="/" />
      </div>
      <h1 className="font-display mb-1 text-center text-2xl font-black text-white">
        {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
      </h1>
      <p className="mb-6 text-center text-sm text-white/60">
        {mode === "login" ? "أهلًا بعودتك، سجّل دخولك لمتابعة حلقتك" : "أنشئ حسابك وابدأ إدارة حلقتك الآن"}
      </p>

      <AuthCard>
        {joinCode && (
          <p className="mb-4 rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-center text-sm text-white/80">
            {joinHalaqah ? (
              <>
                ستنضم كمساعد مشرف لحلقة <span className="font-semibold text-white">{joinHalaqah}</span>
              </>
            ) : (
              "التحقق من رابط الدعوة…"
            )}
          </p>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <label className="block text-sm">
              <span className="text-xs text-white/60">اسم المعلّم</span>
              <div className="relative">
                <input
                  value={teacherName}
                  onChange={(e) => setTeacherName(e.target.value)}
                  placeholder="اسمك الكامل"
                  className={field}
                />
                <UserIcon size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40" />
              </div>
            </label>
          )}

          {mode === "register" && !joinCode && (
            <label className="block text-sm">
              <span className="text-xs text-white/60">اسم الحلقة</span>
              <input
                value={halaqahName}
                onChange={(e) => setHalaqahName(e.target.value)}
                placeholder="مثال: حلقة الفجر"
                className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10"
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="text-xs text-white/60">البريد الإلكتروني</span>
            <div className="relative">
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="email"
                required
                readOnly={googleHandoff}
                className={field}
              />
              <UserIcon size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            </div>
          </label>

          {googleHandoff && (
            <p className="rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-center text-xs text-white/80">
              تم التحقق من بريدك عبر جوجل — أكمل بياناتك وسيُربط حسابك بجوجل
            </p>
          )}

          {!googleHandoff && (
          <label className="block text-sm">
            <span className="text-xs text-white/60">كلمة المرور</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "register" ? 8 : undefined}
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
          )}

          {mode === "login" && (
            <Link href="/forgot-password" className="block text-left text-xs text-white/60 hover:text-white hover:underline">
              نسيت كلمة المرور؟
            </Link>
          )}

          {error && <p className="text-sm text-destructive-light">{error}</p>}
          {errorCode === "no_account" && (
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setError(null);
                setErrorCode(null);
              }}
              className="w-full cursor-pointer rounded-xl border border-white/30 px-3 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
            >
              أنشئ حساباً جديداً
            </button>
          )}
          {errorCode === "account_exists" && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setErrorCode(null);
                }}
                className="flex-1 cursor-pointer rounded-xl border border-white/30 px-3 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
              >
                تسجيل الدخول
              </button>
              <a
                href="/api/auth/google/start"
                className="flex-1 rounded-xl border border-white/30 px-3 py-2.5 text-center text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
              >
                الدخول بجوجل
              </a>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-accent/40 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--color-secondary)", color: "#000000" }}
          >
            {busy ? "لحظة…" : mode === "login" ? "دخول" : "إنشاء الحساب"}
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
          الدخول بحساب جوجل
        </a>

        <p className="mt-4 text-center text-xs text-white/60">
          {mode === "login" ? (
            <>
              ما عندك حساب؟{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                  setErrorCode(null);
                }}
                className="cursor-pointer font-semibold text-white hover:underline"
              >
                أنشئ حساب جديد
              </button>
            </>
          ) : (
            <>
              عندك حساب مسبقاً؟{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                  setErrorCode(null);
                }}
                className="cursor-pointer font-semibold text-white hover:underline"
              >
                سجّل دخولك
              </button>
            </>
          )}
        </p>
        <p className="mt-2 text-center text-xs text-white/60">
          أنت طالب؟{" "}
          <Link href="/student" className="font-semibold text-white hover:underline">
            ادخل من صفحة الطلاب
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}

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
