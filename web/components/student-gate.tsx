"use client";

import { InstallBanner } from "@/components/install-banner";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { AuthCard, AuthShell } from "./auth-shell";
import { BrandLockup } from "./brand";
import { RoleSwitcher, RoleSwitcherList } from "./role-switcher";
import { BackButton } from "./back-button";
import { BellIcon, CloseIcon, EyeIcon, EyeOffIcon, LogoutIcon, MenuIcon, UserIcon } from "./icons";
import { splitBottomNav } from "@/lib/bottom-nav";

export type StudentSession = { id: string; name: string; halaqahName: string };
export type StudentNavItem = { href: string; label: string; desc?: string; icon: React.ReactNode; badge?: React.ReactNode };

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
  sidebar: "#000000",
  sidebarActive: "#AD7D56",
  sidebarText: "#CDB49E",
};

/**
 * يحرس واجهة الطالب: لا يعرض شيئاً قبل التحقق من جلسته، ويعرض شاشة دخول
 * إن لم يكن مسجّلاً — وإلا الهيكل الكامل (قائمة جانبية + شريط علوي على
 * الكمبيوتر، شريط تنقّل سفلي على الجوال) بنفس هوية هيكل المعلّم (STEP 58).
 */
export function StudentGate({
  nav: baseNav,
  classmatesItem,
  children,
}: {
  nav: StudentNavItem[];
  /** يظهر في القائمة فقط حين يفعّل معلّم الحلقة ميزة الزملاء */
  classmatesItem?: StudentNavItem;
  children: React.ReactNode;
}) {
  const [student, setStudent] = useState<StudentSession | null>(null);
  const [classmatesEnabled, setClassmatesEnabled] = useState(false);
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

  const studentId = student?.id ?? null;
  useEffect(() => {
    if (studentId === null) return;
    let cancelled = false;
    fetch("/api/student/classmates/status")
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data: { enabled?: boolean }) => {
        if (!cancelled) setClassmatesEnabled(data.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setClassmatesEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // قبل «الإعدادات» (آخر عنصر)؛ ما زاد على خانات الشريط السفلي يصل عبر «المزيد»
  const nav =
    classmatesEnabled && classmatesItem
      ? [...baseNav.slice(0, -1), classmatesItem, ...baseNav.slice(-1)]
      : baseNav;

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
          <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-8">
            <InstallBanner />
            {children}
          </main>
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
      <div className="px-5 py-5">
        <BrandLockup tone="onDark" context="وردي" href="/student" />
      </div>

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
                color: active ? "#000000" : B.sidebarText,
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

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <span
            className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-on-secondary"
            style={{ backgroundColor: "var(--color-secondary)" }}
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
        <RoleSwitcher />
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
        <BackButton />
        <div className="min-w-0">
          <h1 className="font-display truncate text-base font-bold text-foreground sm:text-lg">{active.label}</h1>
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
              className="tabular flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-sm font-bold text-on-secondary"
              style={{ backgroundColor: "var(--color-secondary)" }}
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
                <RoleSwitcherList />
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogout();
                  }}
                  className="block w-full cursor-pointer px-4 py-2.5 text-right text-sm text-destructive hover:bg-destructive-soft"
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
 * مع مراعاة safe-area لآيفون (STEP 58). يتّسع لخمس خانات: إن زادت العناصر
 * أخذ «المزيد» الخانة الخامسة وفتح ورقة سفلية بالعناصر المتبقية
 * (اختباراتي، زملائي…) فلا يضيع أي منفذ على الجوال.
 */
function BottomNav({ nav }: { nav: StudentNavItem[] }) {
  const pathname = usePathname();
  const { primary, overflow } = splitBottomNav(nav);
  // الورقة مرتبطة بالمسار الذي فُتحت عنده: تنقّل الصفحة يغلقها دون setState داخل effect
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const moreOpen = openedAt === pathname;
  const setMoreOpen = (open: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof open === "function" ? open(moreOpen) : open;
    setOpenedAt(next ? pathname : null);
  };
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const isActive = (item: StudentNavItem) => (item.href === "/student" ? pathname === "/student" : pathname.startsWith(item.href));
  const moreActive = overflow.some(isActive);

  // Escape يغلق ويعيد التركيز لزر «المزيد»؛ وعند الفتح ينتقل التركيز لأول رابط
  useEffect(() => {
    if (!moreOpen) return;
    const button = moreButtonRef.current;
    sheetRef.current?.querySelector<HTMLElement>("a")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenedAt(null);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      button?.focus();
    };
  }, [moreOpen]);

  const itemClass = (active: boolean) =>
    `flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring ${
      active ? "font-semibold" : "text-muted-foreground"
    }`;
  const activeStyle = (active: boolean) => (active ? { color: "var(--color-accent-ink)" } : undefined);

  return (
    <>
      {moreOpen && (
        <div className="no-print fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div
            ref={sheetRef}
            id="student-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="المزيد"
            className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface px-3 pt-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1rem)" }}
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <h2 className="font-display text-base font-bold text-foreground">المزيد</h2>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="cursor-pointer rounded-md p-1.5 text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="إغلاق"
              >
                <CloseIcon size={18} />
              </button>
            </div>
            <ul className="space-y-1">
              {overflow.map((item) => {
                const active = isActive(item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        active ? "font-semibold" : "text-foreground"
                      }`}
                      style={activeStyle(active)}
                    >
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      {item.badge}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        aria-label="التنقّل الرئيسي"
        className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {primary.map((item) => {
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={itemClass(active)}
              style={activeStyle(active)}
            >
              <span className="relative">
                {item.icon}
                {item.badge && <span className="absolute -top-1.5 -left-2.5">{item.badge}</span>}
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        {overflow.length > 0 && (
          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            aria-controls="student-more-sheet"
            className={itemClass(moreActive || moreOpen)}
            style={activeStyle(moreActive || moreOpen)}
          >
            <MenuIcon size={19} />
            <span className="truncate">المزيد</span>
          </button>
        )}
      </nav>
    </>
  );
}

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  not_linked: "هذا الحساب غير مرتبط بأي طالب. اطلب رابط الدعوة من معلّمك.",
  failed: "تعذّر الدخول بحساب جوجل — حاول مرة ثانية.",
};

function StudentLogin({ onAuthenticated }: { onAuthenticated: (s: StudentSession) => void }) {
  const searchParams = useSearchParams();
  const googleError = searchParams.get("googleError");
  // تعبئة مسبقة من مبدّل الأدوار (M5) عند تحويل المستخدم لإثبات كلمة مرور الطالب
  const [username, setUsername] = useState(searchParams.get("username") ?? "");
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
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onDark" href="/welcome" />
      </div>
      <h1 className="font-display mb-1 text-center text-2xl font-black text-white">وردي</h1>
      <p className="mb-6 text-center text-sm text-white/60">
        سجّل حفظك ومراجعتك، ويصل معلّمك أنك أنجزت ورد اليوم.
      </p>

      <AuthCard>
        {googleError && (
          <p className="mb-3 text-center text-sm text-destructive-light">
            {GOOGLE_ERROR_MESSAGES[googleError] ?? GOOGLE_ERROR_MESSAGES.failed}
          </p>
        )}

        {googleError === "not_linked" && (
          <p className="mb-3 text-center text-xs text-white/70">
            إذا كنت معلّماً، ادخل من{" "}
            <Link href="/login" className="font-semibold text-white hover:underline">
              صفحة المعلّمين
            </Link>
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

          {error && <p className="text-sm text-destructive-light">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-accent/40 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--color-secondary)", color: "#000000" }}
          >
            {busy ? "لحظة…" : "دخول"}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-white/60">
          لا تملك حساباً؟ اطلب من معلّم حلقتك أن ينشئ لك اسم مستخدم وكلمة مرور.
        </p>
        <p className="mt-2 text-center text-xs text-white/60">
          أنت معلّم؟{" "}
          <Link href="/login" className="font-semibold text-white hover:underline">
            ادخل من صفحة المعلّمين
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
