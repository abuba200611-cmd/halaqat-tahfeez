"use client";

import { useSharedJson } from "./use-shared-json";

/**
 * وسم عدد الأوراد الجديدة بجانب رابط «الوارد». نسخ الوسم المركّبة بنفس
 * الصفحة (السايدبار + الشريط العلوي) تتشارك جلباً و Refresh واحداً كل
 * نصف دقيقة عبر useSharedJson — فلا تتضاعف الطلبات بعدد النسخ.
 */
export function NewWardBadge() {
  const data = useSharedJson<{ newCount?: number }>("/api/wards?new=1", 30000);
  const count = data?.newCount ?? 0;

  if (count === 0) return null;
  return (
    <span className="tabular inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-on-primary">
      {count}
    </span>
  );
}
