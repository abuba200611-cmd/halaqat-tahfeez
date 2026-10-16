"use client";

import { useSharedJson } from "./use-shared-json";

/**
 * وسم عدد التلاوات بانتظار التقييم بجانب رابط «التلاوات» — نسخ الوسم
 * المركّبة بنفس الصفحة تتشارك جلباً و Refresh واحداً كل دقيقة عبر
 * useSharedJson.
 */
export function PendingRecitationsBadge() {
  const data = useSharedJson<{ pendingCount?: number }>("/api/recitations?count=1", 60000);
  const count = data?.pendingCount ?? 0;

  if (count === 0) return null;
  return (
    <span className="tabular inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-on-primary">
      {count}
    </span>
  );
}
