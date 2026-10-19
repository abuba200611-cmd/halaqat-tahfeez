"use client";

import { InstallBanner } from "@/components/install-banner";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { RoleSwitcher } from "./role-switcher";
import { BrandLockup } from "./brand";
import { BackButton } from "./back-button";
import { markAccountKnown, type TeacherAuthUser } from "./teacher-auth";
import { BellIcon, CloseIcon, LogoutIcon, MailIcon, MenuIcon, SearchIcon } from "./icons";
import { resetStore } from "@/lib/store";
import { staleSessionDestination } from "@/lib/landing";
import { GroupedNav } from "./grouped-nav";
import { flattenNav, type NavGroup } from "@/lib/nav-groups";

type Teacher = TeacherAuthUser;
export type NavItem = { href: string; label: string; desc?: string; icon: React.ReactNode; badge?: React.ReactNode };

/* ————— لوحة ألوان الهيكل — هوية «السلام»: سايدبار أسود، تفعيل بيج فرنسي، نص ثانوي راودو دست ————— */
const B = {
  sidebar: "#000000",
  sidebarActive: "#AD7D56",
  sidebarText: "#CDB49E",
};

/**
 * يحرس التطبيق كله: لا يعرض المحتوى قبل التحقق من الجلسة.
 * الحماية الفعلية على الخادم في مسارات الـ API — هذي طبقة تجربة استخدام.
 */
export function AuthGate({ nav, children }: { nav: NavGroup<NavItem>[]; children: React.ReactNode }) {
  const router = useRouter();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [checking, setChecking] = useState(true);
  const [offline, setOffline] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then(async (data: { teacher: Teacher | null }) => {
        if (cancelled) return;
        if (data.teacher) {
          markAccountKnown();
          setTeacher(data.teacher);
          setChecking(false);
          return;
        }
        // لا جلسة صالحة: لا نعرض نموذج دخول عند الجذر. نمسح كوكي الجلسة الميّت
        // (وإلا يمنع proxy.ts إعادة كتابة "/" للترحيب) ثم نحوّل للواجهة.
        // روابط الدعوة/خطأ جوجل القديمة تذهب لـ/signup بمعاملاتها.
        const clearing = (await fetch("/api/auth/clear-stale", { method: "POST" })
          .then((r) => r.json())
          .catch(() => ({}))) as { home?: string | null };
        if (cancelled) return;
        router.replace(staleSessionDestination(clearing.home, window.location.search));
      })
      .catch(() => {
        // انقطاع الشبكة ≠ لا جلسة: لا نمسح شيئاً ولا نحوّل
        if (!cancelled) {
          setOffline(true);
          setChecking(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    resetStore();
    router.replace("/welcome");
  }, [router]);

  if (checking || (!teacher && !offline)) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>
      </main>
    );
  }

  if (!teacher) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <p className="text-sm text-muted-foreground">تعذّر الاتصال بالخادم.</p>
        <button onClick={() => window.location.reload()} className="mt-3 cursor-pointer text-sm font-semibold text-accent-ink hover:underline">
          إعادة المحاولة
        </button>
      </main>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar nav={nav} teacher={teacher} drawerOpen={drawerOpen} onCloseDrawer={() => setDrawerOpen(false)} onLogout={logout} />

      <div className="min-w-0 flex-1 lg:mr-64">
        <TopBar nav={nav} teacher={teacher} onOpenDrawer={() => setDrawerOpen(true)} />
        {!teacher.emailVerified && <VerifyEmailBanner />}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">
          <InstallBanner />
          {children}
        </main>
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
  nav: NavGroup<NavItem>[];
  teacher: Teacher;
  drawerOpen: boolean;
  onCloseDrawer: () => void;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const initial = (teacher.teacherName || teacher.halaqahName || "م").trim().charAt(0);

  const isActive = (item: NavItem) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));
  const renderItem = (item: NavItem) => {
    const active = isActive(item);
    return (
      <Link
        href={item.href}
        onClick={onCloseDrawer}
        aria-current={active ? "page" : undefined}
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
  };

  const body = (
    <>
      <div className="flex items-center justify-between px-5 py-5">
        <BrandLockup tone="onDark" context="المعلم" />
        <button onClick={onCloseDrawer} className="cursor-pointer rounded-md p-1 text-white/70 hover:text-white lg:hidden" aria-label="إغلاق القائمة">
          <CloseIcon size={20} />
        </button>
      </div>

      <nav aria-label="القائمة الرئيسية" className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
        <GroupedNav
          groups={nav}
          scope="teacher"
          isActive={isActive}
          renderItem={renderItem}
          headerClass="text-white/50 hover:text-white/80"
          dividerClass="border-white/10"
          toggleClass="text-white/60 hover:text-white"
        />
      </nav>

      {/* الأقسام المثبّتة (الإعدادات…) ظاهرة دائماً فوق بطاقة المستخدم */}
      <div className="px-3 pb-2">
        <GroupedNav
          groups={nav}
          scope="teacher"
          pinned
          isActive={isActive}
          renderItem={renderItem}
          headerClass="text-white/50"
          dividerClass="border-white/10"
          toggleClass="text-white/60 hover:text-white"
        />
      </div>

      {/* بطاقة المستخدم — أسفل القائمة الجانبية دائماً */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <span
            className="tabular flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-on-secondary"
            style={{ backgroundColor: "var(--color-secondary)" }}
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
        <RoleSwitcher />
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
function TopBar({ nav: groups, teacher, onOpenDrawer }: { nav: NavGroup<NavItem>[]; teacher: Teacher; onOpenDrawer: () => void }) {
  const pathname = usePathname();
  const nav = flattenNav(groups);
  const active = nav.find((item) => (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))) ?? nav[0];
  const newWardsHref = nav.find((n) => n.href === "/inbox")?.badge;
  const initial = (teacher.teacherName || teacher.halaqahName || "م").trim().charAt(0);

  return (
    <header className="no-print border-b border-border bg-surface">
      <div className="flex items-center gap-3 px-4 py-3 lg:px-8">
        <button onClick={onOpenDrawer} className="cursor-pointer rounded-md p-1.5 text-foreground lg:hidden" aria-label="فتح القائمة">
          <MenuIcon size={22} />
        </button>

        <BackButton />
        <div className="min-w-0">
          <h1 className="font-display truncate text-base font-bold text-foreground sm:text-lg">{active.label}</h1>
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
            className="tabular flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-on-secondary"
            style={{ backgroundColor: "var(--color-secondary)" }}
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
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft px-4 py-2.5 text-sm text-accent-ink">
        <MailIcon size={18} className="shrink-0" />
        <span>لم تؤكّد بريدك الإلكتروني بعد.</span>
        {sent ? (
          <span className="font-semibold">أُعيد الإرسال ✓ تفقّد بريدك.</span>
        ) : (
          <button
            onClick={resend}
            disabled={busy}
            className="mr-auto cursor-pointer rounded-md bg-accent/20 px-3 py-1 text-xs font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "لحظة…" : "أعد الإرسال"}
          </button>
        )}
      </div>
    </div>
  );
}
