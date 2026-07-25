"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Card, Empty, Stat } from "@/components/ui";
import { pageCount, studentJuzes } from "@/lib/pairing";
import { juzLabel } from "@/lib/quran";
import { useStudents } from "@/lib/store";

/** حدّ أعلى للحلقة التجريبية — للتجربة فقط، لا سقف على حلقة حقيقية */
const MAX_DEMO = 1000;

export default function DashboardPage() {
  const { students, loading, loadDemo, clear } = useStudents();
  const [demoCount, setDemoCount] = useState(150);
  const active = students.filter((s) => s.active);

  if (loading) {
    return <Empty title="جارٍ تحميل الحلقة…" />;
  }

  if (students.length === 0) {
    return (
      <Empty
        title="لا يوجد طلاب بعد. جرّب المطابقة بحلقة تجريبية بالعدد الذي تريده، أو أضف طلابك."
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              العدد
              <input
                type="number"
                min={2}
                max={MAX_DEMO}
                value={demoCount}
                onChange={(e) => setDemoCount(Number(e.target.value))}
                className="tabular w-24 rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
            </label>
            <Button
              onClick={() => loadDemo(Math.min(MAX_DEMO, Math.max(2, demoCount)))}
              disabled={!Number.isFinite(demoCount) || demoCount < 2}
            >
              تحميل حلقة تجريبية
            </Button>
            <Link href="/students">
              <Button variant="ghost">إضافة طالب</Button>
            </Link>
          </div>
        }
      />
    );
  }

  const totalPages = active.reduce((sum, s) => sum + pageCount(s), 0);
  const avgPages = active.length ? Math.round(totalPages / active.length) : 0;
  const groups = new Set(active.map((s) => s.group));

  const masteryValues = active.flatMap((s) => Object.values(s.mastery));
  const avgMastery = masteryValues.length
    ? Math.round(masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-naskh text-2xl font-bold">لوحة الحلقة</h1>
        <Button variant="danger" onClick={clear} className="no-print">
          مسح البيانات
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="الطلاب النشطون" value={active.length} hint={`${groups.size} مجموعات`} />
        <Stat label="متوسط المحفوظ" value={avgPages} hint="صفحة لكل طالب" />
        <Stat label="متوسط الإتقان" value={`${avgMastery}٪`} hint="محسوب من التسميعات" />
        <Stat label="إجمالي المحفوظ" value={totalPages.toLocaleString("en")} hint="صفحة في الحلقة" />
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-naskh text-lg font-bold">أكثر الطلاب حفظاً</h2>
        <ul className="divide-y divide-border">
          {[...active]
            .sort((a, b) => pageCount(b) - pageCount(a))
            .slice(0, 8)
            .map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span>{s.name}</span>
                <span className="tabular text-muted-foreground">
                  {pageCount(s)} صفحة · {juzLabel(studentJuzes(s))}
                </span>
              </li>
            ))}
        </ul>
      </Card>

      <div className="no-print flex gap-2">
        <Link href="/pairing">
          <Button>توليد ثنائيات هذا الأسبوع</Button>
        </Link>
        <Link href="/students">
          <Button variant="ghost">إدارة الطلاب</Button>
        </Link>
      </div>
    </div>
  );
}
