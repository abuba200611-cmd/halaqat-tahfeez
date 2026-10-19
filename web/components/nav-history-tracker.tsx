"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { NAV_STACK_KEY, pushPath } from "@/lib/back-nav";

/* يسجّل تنقّل المستخدم داخل التطبيق (sessionStorage) ليعرف زر «رجوع» أن هناك صفحة سابقة. */
export function NavHistoryTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(NAV_STACK_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const stack = Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === "string") : [];
      sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(pushPath(stack, pathname)));
    } catch {
      /* التخزين غير متاح: يعمل الزر بالمسار الاحتياطي */
    }
  }, [pathname]);
  return null;
}
