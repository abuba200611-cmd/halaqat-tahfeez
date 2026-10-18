"use client";

import { useSharedJson } from "./use-shared-json";
import type { MessengerRole } from "./messaging/messenger";

/**
 * وسم غير المقروء بجانب رابط «الرسائل» — يتشارك الجلب مع بقية نسخ الوسم
 * بالصفحة (useSharedJson) ويستقصي كل ١٥ ثانية. الجامع المعطّلة فيه
 * المراسلة يرد 404 فلا بيانات فلا وسم.
 */
export function MessagesBadge({ role }: { role: MessengerRole }) {
  const data = useSharedJson<{ unreadTotal?: number }>(`/api/messages?summary=1&role=${role}`, 15000);
  const count = data?.unreadTotal ?? 0;
  if (count === 0) return null;
  return (
    <span className="tabular inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-on-primary">
      {count}
    </span>
  );
}
