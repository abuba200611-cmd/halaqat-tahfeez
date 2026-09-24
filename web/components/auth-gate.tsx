"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthCard, AuthShell } from "./auth-shell";
import { BellIcon, CloseIcon, EyeIcon, EyeOffIcon, LogoutIcon, MailIcon, MenuIcon, SearchIcon, UserIcon } from "./icons";
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
type NavItem = { href: string; label: string; desc?: string; icon: React.ReactNode; badge?: React.ReactNode };

/* ————— لوحة ألوان الهيكل (STEP 41/42 — يطابق مرجع "لوحة تحكّم بقائمة جانبية زرقاء") ————— */
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
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      <Sidebar nav={nav} teacher={teacher} drawerOpen={drawerOpen} onCloseDrawer={() => setDrawerOpen(false)} onLogout={logout} />

      <div className="min-w-0 flex-1 lg:mr-64">
        <TopBar nav={nav} teacher={teacher} onOpenDrawer={() => setDrawerOpen(true)} />
        {!teacher.emailVerified && <VerifyEmailBanner />}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

/**
 * القائمة الجانبية — كاملة الطول، يمين (RTL). ديسكتوب: ثابتة دائماً
 * (lg+). جوال: Drawer ينزلق من زر ☰ بـTopBar، مع طبقة تعتيم خلفية
 * تُغلقه عند الضغط عليها (STEP 42 — يطابق مرجع القائمة الجانبية الكاملة
 * بدل تبويبات أفقية).
 */
function Sidebar({
  nav,
  teacher,
  drawerOpen,
  onCloseDrawer,
  onLogout,
}: {
  nav: NavItem[];
  teacher: Teacher;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const initial = (teacher.teacherName || teacher.halaqahName || "م").trim().charAt(0);

  const body = (
    <>
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2" onClick={onCloseDrawer}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-naskh text-lg font-bold text-white">
            م
          </span>
          <span className="font-naskh text-lg font-bold text-white">المعلم</span>
        </Link>
        <button onClick={onCloseDrawer} className="cursor-pointer rounded-md p-1 text-white/70 hover:text-white lg:hidden" aria-label="إغلاق القائمة">
          <CloseIcon size={20} />
        </button>
      </div>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseDrawer}
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

      {/* بطاقة المستخدم — أسفل القائمة الجانبية دائماً */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <span
            className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: "#2563EB" }}
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{teacher.teacherName || "معلّم"}</div>
            <div className="truncate text-xs" style={{ color: B.sidebarText }}>
              {teacher.role === "assistant" ? "مساعد مشرف" : "مشرف"} — {teacher.halaqahName}
            </div>
          </div>
          <button
            onClick={onLogout}
            className="shrink-0 cursor-pointer rounded-md p-1.5 text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            title="خروج"
          >
            <LogoutIcon size={17} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ديسكتوب — ثابتة دائماً */}
      <aside className="no-print fixed inset-y-0 right-0 z-20 hidden w-64 flex-col lg:flex" style={{ backgroundColor: B.sidebar }}>
        {body}
      </aside>

      {/* جوال — Drawer */}
      <div className={`no-print fixed inset-0 z-40 lg:hidden ${drawerOpen ? "" : "pointer-events-none"}`}>
        <div
          className="absolute inset-0 bg-black/40 transition-opacity duration-200"
          style={{ opacity: drawerOpen ? 1 : 0 }}
          onClick={onCloseDrawer}
        />
        <aside
          className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col transition-transform duration-200"
          style={{ backgroundColor: B.sidebar, transform: drawerOpen ? "translateX(0)" : "translateX(100%)" }}
        >
          {body}
        </aside>
      </div>
    </>
  );
}

/**
 * الشريط العلوي الأبيض: زر ☰ (جوال فقط) + عنوان الصفحة النشطة ووصفها +
 * بحث (بصري حالياً — بلا نتائج فعلية، لا نضيف منطق بحث جديد فوق طلاب
 * الحلقة بهذي الخطوة) + جرس التنبيهات (newCount حقيقي) + صورة المعلّم.
 */
function TopBar({ nav, teacher, onOpenDrawer }: { nav: NavItem[]; teacher: Teacher; onOpenDrawer: () => void }) {
  const pathname = usePathname();
  const active = nav.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))) ?? nav[0];
  const newWardsHref = nav.find((n) => n.href === "/inbox")?.badge;
  const initial = (teacher.teacherName || teacher.halaqahName || "م").trim().charAt(0);

  return (
    <header className="no-print border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
        <button onClick={onOpenDrawer} className="cursor-pointer rounded-md p-1.5 text-foreground lg:hidden" aria-label="فتح القائمة">
          <MenuIcon size={22} />
        </button>

        <div className="min-w-0">
          <h1 className="truncate font-naskh text-base font-bold text-foreground sm:text-lg">{active.label}</h1>
          {active.desc && <p className="hidden truncate text-xs text-muted-foreground sm:block">{active.desc}</p>}
        </div>

        <div className="relative mr-auto hidden max-w-xs flex-1 md:block">
          <SearchIcon size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="بحث…"
            className="w-full rounded-lg border border-border bg-background py-1.5 pl-3 pr-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>

        <div className="mr-auto flex shrink-0 items-center gap-2 md:mr-0">
          <Link
            href="/inbox"
            className="relative flex items-center justify-center rounded-full p-2 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
          >
            <BellIcon size={19} />
            {newWardsHref && <span className="absolute -left-0.5 -top-0.5">{newWardsHref}</span>}
          </Link>
          <span
            className="tabular flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: "#2563EB" }}
          >
            {initial}
          </span>
        </div>
      </div>
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
  const [showPassword, setShowPassword] = useState(false);

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
    "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10";

  return (
    <AuthShell>
      <h1 className="mb-1 text-center font-naskh text-3xl font-bold text-white">
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

          {mode === "login" && (
            <Link href="/forgot-password" className="block text-left text-xs text-white/60 hover:text-white hover:underline">
              نسيت كلمة المرور؟
            </Link>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-orange-500/40 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: "linear-gradient(90deg, #F97316, #EF4444)" }}
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
                }}
                className="cursor-pointer font-semibold text-white hover:underline"
              >
                سجّل دخولك
              </button>
            </>
          )}
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
