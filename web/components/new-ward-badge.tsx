"use client";

import { useEffect, useState } from "react";

/**
 * وسم عدد الأوراد الجديدة بجانب رابط «الوارد». يستفتي الخادم كل نصف دقيقة
 * حتى يظهر ما يرسله الطلاب دون إعادة تحميل الصفحة.
 */
export function NewWardBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/wards?new=1")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { newCount?: number } | null) => {
          if (active && data) setCount(data.newCount ?? 0);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, 30000);
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
