"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AuthCard, AuthShell } from "./auth-shell";
import { BellIcon, EyeIcon, EyeOffIcon, LogoutIcon, UserIcon } from "./icons";

export type StudentSession = { id: string; name: string; halaqahName: string };
export type StudentNavItem = { href: string; label: string; desc?: string; icon: React.ReactNode };

type StudentContextValue = { student: StudentSession; logout: () => Promise<void> };
const StudentContext = createContext<StudentContextValue | null>(null);

/** هوية الطالب الحالي — يقرأها محتوى الصفحة بعد اجتياز البوابة */
export function useStudentSession(): StudentSession | null {
  return useContext(StudentContext)?.student ?? null;
}

/** تسجيل خروج الطالب — لزر بصفحة الإعدادات (STEP 58) */
export function useStudentLogout(): () => Promise<void> {
  const ctx = useContext(StudentContext);
  return ctx?.logout ?? (async () => {});
}

/* نفس لوحة ألوان هيكل المعلّم بالضبط (components/auth-gate.tsx، STEP 41/42) — لا نظام تصميم ثانٍ */
const B = {
  sidebar: "#0F1E42",
  sidebarActive: "#1B3568",
  sidebarText: "#9FB0D6",
};

/**
 * يحرس واجهة الطالب: لا يعرض شيئاً قبل التحقق من جلسته، ويعرض شاشة دخول
 * إن لم يكن مسجّلاً — وإلا الهيكل الكامل (قائمة جانبية + شريط علوي على
 * الكمبيوتر، شريط تنقّل سفلي على الجوال) بنفس هوية هيكل المعلّم (STEP 58).
 */
export function StudentGate({ nav, children }: { nav: StudentNavItem[]; children: React.ReactNode }) {
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

  return (
    <StudentContext.Provider value={{ student, logout }}>
      <div className="flex min-h-full flex-1">
        <Sidebar nav={nav} student={student} onLogout={logout} />

        <div className="min-w-0 flex-1 pb-20 md:pb-0 md:mr-64">
          <TopBar nav={nav} student={student} onLogout={logout} />
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-8">{children}</main>
        </div>

        <BottomNav nav={nav} />
      </div>
    </StudentContext.Provider>
  );
}

/**
 * القائمة الجانبية — من md (٧٦٨px) فصاعداً فقط، بلا Drawer وسيط: تحت
 * ٧٦٨px BottomNav هو التنقّل الوحيد كما طلبت المواصفة بالضبط (بخلاف
 * قائمة المعلّم التي تستخدم Drawer بين الجوال وlg).
 */
function Sidebar({ nav, student, onLogout }: { nav: StudentNavItem[]; student: StudentSession; onLogout: () => void }) {
  const pathname = usePathname();
  const initial = (student.name || "ط").trim().charAt(0);

  return (
    <aside className="no-print fixed inset-y-0 right-0 z-20 hidden w-64 flex-col md:flex" style={{ backgroundColor: B.sidebar }}>
      <Link href="/student" className="flex items-center gap-2 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 font-naskh text-lg font-bold text-white">
          ط
        </span>
        <span className="font-naskh text-lg font-bold text-white">وردي</span>
      </Link>

      <nav className="mt-2 flex-1 space-y-1 overflow-y-auto px-3">
        {nav.map((item) => {
          const active = item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href);
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
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <span
            className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ backgroundColor: "#2563EB" }}
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{student.name}</div>
            <div className="truncate text-xs" style={{ color: B.sidebarText }}>
              {student.halaqahName || "وردي"}
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
    </aside>
  );
}

/**
 * الشريط العلوي (على كل الأحجام — تحت md وحده BottomNav يغطي التنقّل
 * الأساسي أيضاً): عنوان الصفحة الحالية (من nav حسب المسار)، اسم الطالب
 * وحلقته، جرس الإشعارات → الإعدادات، وأفاتار قابل للنقر يفتح قائمة
 * صغيرة "الإعدادات"/"تسجيل خروج" — هذا الأفاتار هو منفذ الجوال الوحيد
 * الصريح للإعدادات وتسجيل الخروج (بدل استبدال أحد الروابط الخمسة
 * بالشريط السفلي، فتبقى كلها بمكانها ويُضاف منفذ واضح بدلاً من تحميل
 * جرس الإشعارات معنى مزدوجاً STEP 58).
 */
function TopBar({ nav, student, onLogout }: { nav: StudentNavItem[]; student: StudentSession; onLogout: () => void }) {
  const pathname = usePathname();
  const active = nav.find((item) => (item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href))) ?? nav[0];
  const initial = (student.name || "ط").trim().charAt(0);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("click", onClickOutside);
    return () => document.removeEventListener("click", onClickOutside);
  }, [menuOpen]);

  return (
    <header className="no-print border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 md:px-8">
        <div className="min-w-0">
          <h1 className="truncate font-naskh text-base font-bold text-foreground sm:text-lg">{active.label}</h1>
          {active.desc && <p className="hidden truncate text-xs text-muted-foreground sm:block">{active.desc}</p>}
        </div>

        <div className="mr-auto flex shrink-0 items-center gap-3">
          <div className="hidden text-left sm:block">
            <div className="truncate text-sm font-semibold text-foreground">{student.name}</div>
            <div className="truncate text-xs text-muted-foreground">{student.halaqahName}</div>
          </div>
          <Link
            href="/student/settings"
            className="relative flex items-center justify-center rounded-full p-2 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
            aria-label="الإشعارات"
          >
            <BellIcon size={19} />
          </Link>
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="tabular flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: "#2563EB" }}
              aria-label="حساب الطالب"
              aria-expanded={menuOpen}
            >
              {initial}
            </button>
            {menuOpen && (
              <div className="absolute left-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg">
                <Link
                  href="/student/settings"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm text-foreground hover:bg-muted"
                >
                  الإعدادات
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                  className="block w-full cursor-pointer px-4 py-2.5 text-right text-sm text-red-600 hover:bg-red-50"
                >
                  تسجيل خروج
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * شريط تنقّل ثابت أسفل الشاشة — جوال فقط (<768px) بدل القائمة الجانبية،
 * مع مراعاة safe-area لآيفون (STEP 58). أول 5 عناصر من nav فقط (تصميم
 * لشريط سفلي لا يتّسع لأكثر).
 */
function BottomNav({ nav }: { nav: StudentNavItem[] }) {
  const pathname = usePathname();
  const items = nav.slice(0, 5);

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {items.map((item) => {
        const active = item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors duration-200 ${
              active ? "font-semibold" : "text-muted-foreground"
            }`}
            style={active ? { color: "#2563EB" } : undefined}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  not_linked: "هذا الحساب غير مرتبط بأي طالب. اطلب رابط الدعوة من معلّمك.",
  failed: "تعذّر الدخول بحساب جوجل — حاول مرة ثانية.",
};

function StudentLogin({ onAuthenticated }: { onAuthenticated: (s: StudentSession) => void }) {
  const searchParams = useSearchParams();
  const googleError = searchParams.get("googleError");
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
        {googleError && (
          <p className="mb-3 text-center text-sm text-red-400">
            {GOOGLE_ERROR_MESSAGES[googleError] ?? GOOGLE_ERROR_MESSAGES.failed}
          </p>
        )}

        <a
          href="/api/student-auth/google/link/start?mode=login"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-3 py-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/10"
        >
          <GoogleIcon />
          الدخول بحساب Google
        </a>

        <div className="my-4 flex items-center gap-3 text-xs text-white/40">
          <span className="h-px flex-1 bg-white/15" />
          أو
          <span className="h-px flex-1 bg-white/15" />
        </div>

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
