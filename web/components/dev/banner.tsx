"use client";

import { useState } from "react";

/**
 * الشريط الأحمر الثابت أثناء «عرض كـ» — يظهر على كل صفحة يدخلها الدور
 * المنتحَل، وزر «إنهاء» يوقف العرض ويرجع للوحة المطوّر /dev (البقاء
 * بصفحة الدور بعد حذف كوكيزه يُظهر شاشة دخول ذلك الدور بلا داعٍ).
 */
export function ImpersonationBanner({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);

  async function end() {
    setBusy(true);
    try {
      await fetch("/api/dev/impersonate/end", { method: "POST" });
    } finally {
      window.location.href = "/dev";
    }
  }

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-semibold text-white shadow-md">
      <span aria-hidden>👁</span>
      <span>أنت تشاهد كـ {label}</span>
      <span className="hidden text-xs font-normal text-white/80 sm:inline">
        الإجراءات الهدّامة معطّلة — الإضافة تُسجَّل
      </span>
      <button
        type="button"
        onClick={end}
        disabled={busy}
        className="cursor-pointer rounded-md bg-white px-3 py-1 text-xs font-bold text-destructive transition-opacity duration-200 hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "لحظة…" : "إنهاء"}
      </button>
    </div>
  );
}
