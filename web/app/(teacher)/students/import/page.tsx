"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Empty } from "@/components/ui";
import { ImportPanel } from "@/components/enrollment/import-panel";

/** استيراد المعلّم لطلاب حلقته من Excel/CSV — الحلقة من جلسته حصراً (الخادم يتجاهل أي حلقة بالملف) */
export default function TeacherImportPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teacher/import")
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { enabled?: boolean } | null) => {
        if (!cancelled) setEnabled(d?.enabled === true);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled === null) return <Empty title="جارٍ التحميل…" />;
  if (!enabled) {
    return <Empty title="استيراد الطلاب غير مفعّل لجامع حلقتك." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">استيراد طلاب من Excel / CSV</h1>
        <Link href="/students" className="text-sm text-accent-ink hover:underline">
          رجوع للطلاب
        </Link>
      </div>
      <ImportPanel endpoint="/api/teacher/import" templateUrl="/api/teacher/import/template" showHalaqah={false} />
    </div>
  );
}
