"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedJson } from "./use-shared-json";

/*
  M5 — مبدّل الأدوار: يعرض عضويات المستخدم الموحّد الأخرى الفعّالة أينما
  وُضع (قشور المعلّم/الطالب/ولي الأمر/الجامع/المطوّر) وينفّذ القاعدة
  المعروضة له من /api/identity/me: تبديل مباشر (نفس نوع الجلسة الحالية —
  كلمة مروره أُثبتت بهذا الدخول)، أو مجرد تنقّل (جلسة ذلك النوع صالحة على
  الجهاز أصلاً)، أو تحويل لصفحة دخول ذلك الدور معبَّأة مسبقاً (لا يُصدر
  كوكي بلا كلمة مرور ذلك النوع أبداً). بلا عضويات أخرى = لا يظهر شيئاً.
*/

export type SwitcherMembership = {
  id: number;
  label: string;
  switchable: boolean;
  sessionActive: boolean;
  home: string;
  loginHref: string | null;
};

function useSwitcherMemberships() {
  // طلب واحد لعنوان الهوية أياً بعدد النسخ المركّبة (السايدبار مركّب مرتين
  // بهيكل المعلّم، وقائمة الأفاتار بالطالب) — مشترك عبر useSharedJson
  const data = useSharedJson<{ memberships?: SwitcherMembership[] }>("/api/identity/me");
  const items = data ? (data.memberships ?? []) : null;

  const activate = useCallback(async (item: SwitcherMembership) => {
    // جلسة ذلك النوع صالحة أصلاً على الجهاز — التنقّل إليها يكفي
    if (item.sessionActive) {
      window.location.href = item.home;
      return;
    }
    // نوع آخر يحتاج كلمة مروره — لا تبديل، بل دخول ذلك الدور معبَّأً
    if (!item.switchable) {
      window.location.href = item.loginHref ?? item.home;
      return;
    }
    try {
      const res = await fetch("/api/identity/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId: item.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { redirect?: string; loginHref?: string };
      // الرفض (403) يعني أن الدور يحتاج كلمة مروره — نحوّل لصفحة دخوله
      if (res.ok && data.redirect) {
        window.location.href = data.redirect;
      } else {
        window.location.href = data.loginHref ?? item.loginHref ?? item.home;
      }
    } catch {
      // خطأ شبكة فقط — نبقى بالمكان، والمستخدم يعيد المحاولة
    }
  }, []);

  return { items, activate };
}

/** زر «تبديل الدور» بقائمة منسدلة — للقوائم الجانبية والأشرطة (dark) أو الخلفيات الفاتحة (light) */
export function RoleSwitcher({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { items, activate } = useSwitcherMemberships();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (items === null || items.length === 0) return null;

  const isDark = tone === "dark";
  const buttonCls = isDark
    ? "w-full cursor-pointer rounded-lg px-2 py-1.5 text-right text-xs text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
    : "w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors duration-200 hover:bg-slate-50";
  const itemCls = isDark
    ? "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white"
    : "flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors duration-200 hover:bg-slate-100";

  return (
    <div ref={rootRef} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className={buttonCls} aria-expanded={open}>
        ⇄ تبديل الدور
      </button>
      {open && (
        <div
          className={`absolute bottom-full right-0 z-50 mb-2 w-56 rounded-xl p-1.5 shadow-xl ${
            isDark ? "bg-slate-900 ring-1 ring-white/15" : "border border-slate-200 bg-white"
          }`}
        >
          {items.map((item) => (
            <button key={item.id} type="button" onClick={() => activate(item)} className={itemCls}>
              <span className="min-w-0 flex-1 truncate text-right">{item.label}</span>
              <span className="shrink-0 text-[10px] opacity-60">
                {item.sessionActive ? "جلسة فعّالة" : item.switchable ? "تبديل" : "دخول"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** قائمة أدوار مسطّحة — تُدمَج داخل قوائم موجودة (قائمة حساب الطالب مثلاً) */
export function RoleSwitcherList() {
  const { items, activate } = useSwitcherMemberships();
  if (items === null || items.length === 0) return null;
  return (
    <>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => activate(item)}
          className="block w-full cursor-pointer px-4 py-2.5 text-right text-sm text-foreground hover:bg-muted"
        >
          ⇄ {item.label}
        </button>
      ))}
    </>
  );
}
