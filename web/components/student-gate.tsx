"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AuthCard, AuthShell } from "./auth-shell";
import { EyeIcon, EyeOffIcon, LogoutIcon, UserIcon } from "./icons";

export type StudentSession = { id: string; name: string; halaqahName: string };

const StudentContext = createContext<StudentSession | null>(null);

/** هوية الطالب الحالي — يقرأها محتوى الصفحة بعد اجتياز البوابة */
export function useStudentSession(): StudentSession | null {
  return useContext(StudentContext);
}

/**
 * يحرس واجهة الطالب: لا يعرض ورده قبل التحقق من جلسته، ويعرض شاشة دخول
 * بسيطة (اسم مستخدم + كلمة مرور) إن لم يكن مسجّلاً. منفصل تماماً عن بوابة المعلّم.
 */
export function StudentGate({ children }: { children: React.ReactNode }) {
  const [student, setStudent] = useState<StudentSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student-auth/me")
      .then((res) => res.json())
      .then((data: { student: StudentSession | null }) => {
        if (!cancelled) setStudent(data.student);
      })
      .catch(() => {
        if (!cancelled) setStudent(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/student-auth/logout", { method: "POST" });
    setStudent(null);
  }, []);

  if (checking) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>
      </main>
    );
  }

  if (!student) {
    return <StudentLogin onAuthenticated={setStudent} />;
  }

  const initial = (student.name || "ط").trim().charAt(0);

  return (
    <StudentContext.Provider value={student}>
      <header className="text-white" style={{ background: "linear-gradient(90deg, #1E3A8A, #2563EB)" }}>
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-sm font-bold">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold">{student.name}</div>
            <div className="truncate text-xs text-white/70">{student.halaqahName || "وردي"}</div>
          </div>
          <button
            onClick={logout}
            className="shrink-0 cursor-pointer rounded-lg p-2 text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title="خروج"
            aria-label="خروج"
          >
            <LogoutIcon size={19} />
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</main>
    </StudentContext.Provider>
  );
}

function StudentLogin({ onAuthenticated }: { onAuthenticated: (s: StudentSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/student-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { student?: { id: string; name: string }; error?: string };
      if (!res.ok || !data.student) {
        setError(data.error ?? "تعذّر تسجيل الدخول");
        return;
      }
      // نعيد الجلب من /me لأخذ اسم الحلقة كاملاً
      const me = (await fetch("/api/student-auth/me").then((r) => r.json())) as {
        student: StudentSession | null;
      };
      onAuthenticated(me.student ?? { ...data.student, halaqahName: "" });
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
      <h1 className="mb-1 text-center font-naskh text-3xl font-bold text-white">وردي</h1>
      <p className="mb-6 text-center text-sm text-white/60">
        سجّل حفظك ومراجعتك، ويصل معلّمك أنك أنجزت ورد اليوم.
      </p>

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

        <p className="mt-4 text-center text-xs text-white/60">
          لا تملك حساباً؟ اطلب من معلّم حلقتك أن ينشئ لك اسم مستخدم وكلمة مرور.
        </p>
      </AuthCard>
    </AuthShell>
  );
}
