"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Empty, Stat } from "@/components/ui";
import { MONTH_NAMES } from "@/lib/schedule";

type MonthlyReport = { key: string; hifzPages: number; reviewPages: number; activeStudents: number };

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export default function ReportsPage() {
  const [months, setMonths] = useState<MonthlyReport[] | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/reports/monthly");
      if (res.ok) {
        const data = (await res.json()) as { months?: MonthlyReport[] };
        setMonths(data.months ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-naskh text-2xl font-bold">أداء الحلقة الشهري</h1>
        <p className="text-sm text-muted-foreground">
          مجموع صفحات الحفظ والمراجعة كل شهر، من كل الطلاب المرتبطين + وارد النظام الداخلي.
        </p>
      </div>

      {loading || !months ? (
        <Empty title="جارٍ التحميل…" />
      ) : months.length === 0 ? (
        <Empty title="ما فيه ورد مسجّل بعد لعرض تقرير شهري. اربط طلابك بتسجيل الطلاب أولاً." />
      ) : (
        <ul className="space-y-3">
          {months.map((m) => (
            <li key={m.key}>
              <Card className="p-4">
                <h2 className="mb-3 font-naskh text-lg font-bold">{monthLabel(m.key)}</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="صفحات الحفظ" value={m.hifzPages} />
                  <Stat label="صفحات المراجعة" value={m.reviewPages} />
                  <Stat label="مجموع الصفحات" value={m.hifzPages + m.reviewPages} />
                  <Stat label="طلاب نشطون" value={m.activeStudents} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
