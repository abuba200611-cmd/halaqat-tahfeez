"use client";

import { Card } from "@/components/ui";
import { useApi } from "@/components/mosque/use-api";

type Health = {
  dbSize: string;
  rateLimits: { key: string; total: number }[];
  tableSizes: { table: string; size: string }[];
  errors: { id: number; at: string; scope: string; message: string }[];
};

export default function DevHealthPage() {
  const { data, loading, status } = useApi<Health>("/api/dev/health");

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>;
  if (!data) {
    return (
      <Card className="p-4 text-sm text-destructive">
        {status === 401 ? "الجلسة انتهت — سجّل الدخول من جديد." : "تعذّر التحميل."}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">الصحة</h1>
        <p className="text-sm text-muted-foreground">حجم القاعدة: {data.dbSize}</p>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">أحدث أخطاء الخادم (١٠٠)</h2>
        {data.errors.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا أخطاء مسجّلة — السجل يبدأ من المسرى المزوَّد (أوراد/حضور/تلاوات/توزيع/انضمام).</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.errors.map((e) => (
              <li key={e.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular">{e.at.slice(0, 16).replace("T", " ")}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono" dir="ltr">{e.scope}</span>
                </div>
                <p className="mt-1 break-words">{e.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">الأكثر استهلاكاً لحدود المعدل اليوم</h2>
          {data.rateLimits.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا استهلاك اليوم.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.rateLimits.map((r) => (
                <li key={r.key} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate font-mono text-xs" dir="ltr">{r.key}</span>
                  <span className="tabular font-semibold">{r.total}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">أكبر الجداول (١٥)</h2>
          <ul className="divide-y divide-border text-sm">
            {data.tableSizes.map((t) => (
              <li key={t.table} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 truncate font-mono text-xs" dir="ltr">{t.table}</span>
                <span className="tabular font-semibold">{t.size}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
