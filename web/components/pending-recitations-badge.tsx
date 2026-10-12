"use client";

import { useEffect, useState } from "react";

/** وسم عدد التلاوات بانتظار التقييم بجانب رابط «التلاوات» — يستفتي الخادم كل دقيقة */
export function PendingRecitationsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/recitations?count=1")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { pendingCount?: number } | null) => {
          if (active && data) setCount(data.pendingCount ?? 0);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (count === 0) return null;
  return (
    <span className="tabular inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-on-primary">
      {count}
    </span>
  );
}
