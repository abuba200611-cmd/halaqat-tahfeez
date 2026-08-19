"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "./ui";
import { resetStore } from "@/lib/store";

type Teacher = { id: number; username: string; halaqahName: string };
type NavItem = { href: string; label: string; badge?: React.ReactNode };

/**
 * يحرس التطبيق كله: لا يعرض المحتوى قبل التحقق من الجلسة.
 * الحماية الفعلية على الخادم في مسارات الـ API — هذي طبقة تجربة استخدام.
 */
export function AuthGate({ nav, children }: { nav: NavItem[]; children: React.ReactNode }) {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { teacher: Teacher | null }) => {
        if (!cancelled) setTeacher(data.teacher);
      })
      .catch(() => {
        if (!cancelled) setTeacher(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onAuthenticated = useCallback((next: Teacher) => {
    resetStore();
    setTeacher(next);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    resetStore();
    setTeacher(null);
  }, []);

  if (checking) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>
      </main>
    );
  }

  if (!teacher) {
    return <AuthScreen onAuthenticated={onAuthenticated} />;
  }

  return (
    <>
      <header className="no-print border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link href="/" className="font-naskh text-lg font-bold text-primary">
            حلقات
          </Link>
          <nav className="flex gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {item.label}
                {item.badge}
              </Link>
            ))}
          </nav>
          <div className="mr-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{teacher.halaqahName}</span>
            <Button variant="ghost" onClick={logout}>
              خروج
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (teacher: Teacher) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [halaqahName, setHalaqahName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, halaqahName }),
      });
      const data = (await res.json()) as { teacher?: Teacher; error?: string };
      if (!res.ok || !data.teacher) {
        setError(data.error ?? "تعذّر إتمام العملية");
        return;
      }
      onAuthenticated(data.teacher);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-center font-naskh text-2xl font-bold text-primary">حلقات</h1>
      <p className="mb-5 text-center text-sm text-muted-foreground">
        إدارة التحفيظ ومطابقة التسميع وجدول الشهر
      </p>

      <Card className="p-5">
        <div className="mb-4 flex gap-1 border-b border-border">
          {(["login", "register"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors duration-200 ${
                mode === value
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {value === "login" ? "تسجيل الدخول" : "حساب جديد"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">اسم الحلقة</span>
              <input
                value={halaqahName}
                onChange={(e) => setHalaqahName(e.target.value)}
                placeholder="مثال: حلقة الفجر"
                className={field}
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">البريد الإلكتروني</span>
            <input
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="email"
              required
              className={field}
            />
          </label>

          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">كلمة المرور</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "register" ? 8 : undefined}
              className={field}
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "لحظة…" : mode === "login" ? "دخول" : "إنشاء الحساب"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
