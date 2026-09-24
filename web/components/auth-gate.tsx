"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Card } from "./ui";
import { BellIcon, LogoutIcon, MailIcon } from "./icons";
import { resetStore } from "@/lib/store";

type Teacher = {
  id: number;
  username: string;
  teacherName: string;
  halaqahId: number;
  halaqahName: string;
  role: "supervisor" | "assistant";
  emailVerified: boolean;
};
type NavItem = { href: string; label: string; icon: React.ReactNode; badge?: React.ReactNode };

/* ————— لوحة ألوان الهيكل (STEP 41 — يطابق مرجع "لوحة تحكّم بقائمة جانبية زرقاء") ————— */
const B = {
  sidebar: "#0F1E42",
  sidebarActive: "#1B3568",
  sidebarText: "#9FB0D6",
};

/*
  أول زيارة، الجهاز ما عنده حساب بعد — عرض تبويب "تسجيل الدخول" مربك (يطلب
  دخول لحساب مو موجود). نتذكّر بمتصفّح الجهاز إذا سبق أنشأ/سجّل دخول حساب،
  ونعرض النمط المناسب افتراضياً بدل تبويبين متساويين من البداية.
*/
const KNOWN_ACCOUNT_KEY = "halaqat_known_account";
function markAccountKnown() {
  try {
    window.localStorage.setItem(KNOWN_ACCOUNT_KEY, "1");
  } catch {
    // localStorage قد يكون معطّلاً (وضع خاص) — لا يوقف تسجيل الدخول
  }
}

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
        if (data.teacher) markAccountKnown();
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
    <div className="flex min-h-full flex-1">
      <Sidebar nav={nav} />

      <div className="min-w-0 flex-1 lg:mr-64">
        <TopBar nav={nav} teacher={teacher} onLogout={logout} />
        {!teacher.emailVerified && <VerifyEmailBanner />}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/** القائمة الجانبية — ديسكتوب فقط (lg+)؛ الجوال يستخدم شريط التبويبات العلوي بـTopBar (STEP 41) */
function Sidebar({ nav }: { nav: NavItem[] }) {
  const pathname = usePathname();

  return (
    <aside
      className="no-print fixed inset-y-0 right-0 z-20 hidden w-64 flex-col lg:flex"
      style={{ backgroundColor: B.sidebar }}
    >
      <Link href="/" className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-naskh text-lg font-bold text-white">
          م
        </span>
        <span className="font-naskh text-lg font-bold text-white">المعلم</span>
      </Link>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              style={{
                backgroundColor: active ? B.sidebarActive : "transparent",
                color: active ? "#ffffff" : B.sidebarText,
                fontWeight: active ? 600 : 400,
              }}
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
              {item.badge}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/** الشريط العلوي: ديسكتوب — جرس تنبيهات + هوية المعلّم؛ جوال — نفس هويّة الشعار + تبويبات أفقية (STEP 41) */
function TopBar({ nav, teacher, onLogout }: { nav: NavItem[]; teacher: Teacher; onLogout: () => void }) {
  const pathname = usePathname();
  const newWardsHref = nav.find((n) => n.href === "/inbox")?.badge;
  const initial = (teacher.teacherName || teacher.halaqahName || "م").trim().charAt(0);

  return (
    <header className="no-print border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
        <Link href="/" className="shrink-0 font-naskh text-lg font-bold lg:hidden" style={{ color: "#1E3A8A" }}>
          المعلم
        </Link>

        <div className="mr-auto flex min-w-0 items-center gap-3">
          {teacher.role === "assistant" && (
            <span className="hidden shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs text-accent sm:inline">
              مساعد مشرف
            </span>
          )}
          <span className="hidden truncate text-sm text-muted-foreground lg:inline">
            {teacher.teacherName ? `${teacher.teacherName} — ${teacher.halaqahName}` : teacher.halaqahName}
          </span>

          <Link
            href="/inbox"
            className="relative hidden items-center justify-center rounded-full p-2 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground lg:flex"
          >
            <BellIcon size={19} />
            {newWardsHref && <span className="absolute -left-0.5 -top-0.5">{newWardsHref}</span>}
          </Link>

          <div className="hidden items-center gap-2 lg:flex">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: "#2563EB" }}
            >
              {initial}
            </span>
            <button
              onClick={onLogout}
              className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
              title="خروج"
            >
              <LogoutIcon size={17} />
            </button>
          </div>

          <Button variant="ghost" onClick={onLogout} className="shrink-0 lg:hidden">
            خروج
          </Button>
        </div>
      </div>

      {/* شريط تبويبات أفقي — الجوال فقط، القائمة الجانبية تكفي الديسكتوب */}
      <nav className="no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-5 pb-2 lg:hidden">
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
                (active ? "bg-[#2563EB]/10 font-semibold text-[#1E3A8A]" : "text-muted-foreground hover:bg-muted hover:text-foreground")
              }
            >
              {item.label}
              {item.badge}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/** شريط تذكير بتأكيد البريد — يظهر فقط لمن سجّل ببريد/كلمة مرور ولم يؤكّد بعد (STEP 40: بطاقة هادئة بدل شريط ممتد) */
function VerifyEmailBanner() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resend() {
    setBusy(true);
    try {
      await fetch("/api/auth/resend-verification", { method: "POST" });
      setSent(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="no-print mx-auto w-full max-w-7xl px-4 pt-3 lg:px-8">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
        <MailIcon size={18} className="shrink-0" />
        <span>لم تؤكّد بريدك الإلكتروني بعد.</span>
        {sent ? (
          <span className="font-semibold">أُعيد الإرسال ✓ تفقّد بريدك.</span>
        ) : (
          <button
            onClick={resend}
            disabled={busy}
            className="mr-auto cursor-pointer rounded-md bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900 transition-colors duration-200 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "لحظة…" : "أعد الإرسال"}
          </button>
        )}
      </div>
    </div>
  );
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (teacher: Teacher) => void }) {
  // رابط دعوة معلّم زميل (?join=رمز) — يفرض وضع "حساب جديد" وينضم كمساعد
  // مشرف لحلقة قائمة بدل إنشاء حلقة جديدة.
  const [joinCode] = useState<string>(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("join") ?? "",
  );
  const [joinHalaqah, setJoinHalaqah] = useState<string | null>(null);
  const [mode, setMode] = useState<"login" | "register">(() => {
    if (typeof window === "undefined") return "register";
    if (new URLSearchParams(window.location.search).get("join")) return "register";
    try {
      return window.localStorage.getItem(KNOWN_ACCOUNT_KEY) ? "login" : "register";
    } catch {
      return "register";
    }
  });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [teacherName, setTeacherName] = useState("");
  const [halaqahName, setHalaqahName] = useState("");
  const [error, setError] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("googleError"),
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (error) window.history.replaceState(null, "", window.location.pathname);
  }, [error]);

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
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          teacherName,
          halaqahName,
          joinCode: mode === "register" ? joinCode : undefined,
        }),
      });
      const data = (await res.json()) as { teacher?: Teacher; error?: string };
      if (!res.ok || !data.teacher) {
        setError(data.error ?? "تعذّر إتمام العملية");
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
    "mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-center font-naskh text-2xl font-bold text-primary">المعلم</h1>
      <p className="mb-5 text-center text-sm text-muted-foreground">
        إدارة التحفيظ ومطابقة التسميع وجدول الشهر
      </p>

      <Card className="p-5">
        {joinCode && (
          <p className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-center text-sm text-primary">
            {joinHalaqah ? (
              <>
                ستنضم كمساعد مشرف لحلقة <span className="font-semibold">{joinHalaqah}</span>
              </>
            ) : (
              "التحقق من رابط الدعوة…"
            )}
          </p>
        )}

        <h2 className="mb-4 text-center text-base font-semibold text-foreground">
          {mode === "login" ? "تسجيل الدخول" : "إنشاء حساب جديد"}
        </h2>

        <form onSubmit={submit} className="space-y-3">
          {mode === "register" && (
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">اسم المعلّم</span>
              <input
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="اسمك الكامل"
                className={field}
              />
            </label>
          )}

          {mode === "register" && !joinCode && (
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

          {mode === "login" && (
            <Link href="/forgot-password" className="block text-left text-xs text-primary hover:underline">
              نسيت كلمة المرور؟
            </Link>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "لحظة…" : mode === "login" ? "دخول" : "إنشاء الحساب"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          أو
          <span className="h-px flex-1 bg-border" />
        </div>

        <a
          href="/api/auth/google/start"
          className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <GoogleIcon />
          الدخول بحساب جوجل
        </a>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "login" ? (
            <>
              ما عندك حساب؟{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
                className="cursor-pointer font-semibold text-primary hover:underline"
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
                }}
                className="cursor-pointer font-semibold text-primary hover:underline"
              >
                سجّل دخولك
              </button>
            </>
          )}
        </p>
      </Card>
    </main>
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
