"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button, Empty } from "@/components/ui";
import { TeacherWardForm } from "@/components/teacher-ward-form";

type RosterStudent = {
  id: string;
  name: string;
  recordedToday: boolean;
  lastSummary: string | null;
};

/**
 * شاشة «تسجيل الورد» المتتابعة (001 T027، FR-004): قائمة طلاب الابتدائي
 * مع شارة «سُجِّل اليوم»، وبعد حفظ كل طالب ينتقل النموذج تلقائياً للتالي
 * ممن لم يُسجَّل له — بلا عودة للقائمة ولا للرئيسية (SC-001).
 */
export default function TeacherRecordPage() {
  const searchParams = useSearchParams();
  const studentParam = searchParams.get("student");

  const [roster, setRoster] = useState<RosterStudent[] | "error" | "forbidden" | null>(null);
  const [date, setDate] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teacher/wards/roster")
      .then(async (res) => {
        if (res.status === 403) return "forbidden" as const;
        if (!res.ok) return "error" as const;
        return (await res.json()) as { date: string; students: RosterStudent[] };
      })
      .then((data) => {
        if (cancelled) return;
        if (data === "error" || data === "forbidden") {
          setRoster(data);
          return;
        }
        setRoster(data.students);
        setDate(data.date);
        // فتح مباشر من رابط صفحة الطالب (T028: record?student=)
        if (studentParam && data.students.some((s) => s.id === studentParam)) {
          setActiveId(studentParam);
        }
      })
      .catch(() => {
        if (!cancelled) setRoster("error");
      });
    return () => {
      cancelled = true;
    };
  }, [studentParam]);

  if (roster === null) return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  if (roster === "forbidden") {
    return (
      <Empty
        title="تسجيل الورد عن الطالب متاح لحلقات الابتدائي فقط."
        action={
          <Link href="/settings" className="text-sm font-semibold text-accent-ink hover:underline">
            الفئة العمرية من الإعدادات
          </Link>
        }
      />
    );
  }
  if (roster === "error") return <Empty title="تعذّر تحميل قائمة الطلاب — حاول لاحقاً." />;

  const active = roster.find((s) => s.id === activeId) ?? null;
  const remaining = roster.filter((s) => !s.recordedToday && !justSaved.includes(s.id)).length;

  function markSaved(studentId: string, nextStudentId: string | null) {
    setJustSaved((prev) => [...prev, studentId]);
    // الانتقال التلقائي للتالي دون العودة للقائمة (سيناريو 2) — أو إغلاق
    // النموذج عند نهاية القائمة
    if (nextStudentId) {
      setActiveId(nextStudentId);
    } else {
      setActiveId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-bold">تسجيل الورد</h1>
        <p className="tabular text-xs text-muted-foreground">{date}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        سمِّع للطالب ثم اضغط اسمه وسجّل ورده — يُحفظ معتمداً باسمك فوراً.
        {remaining > 0 ? ` بقي ${remaining} طالباً لم يُسجَّل له اليوم.` : " سُجِّل للجميع اليوم، الحمد لله."}
      </p>

      {active ? (
        <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-bold text-foreground">{active.name}</h2>
            <button
              type="button"
              onClick={() => setActiveId(null)}
              className="cursor-pointer text-xs font-semibold text-muted-foreground underline hover:no-underline"
            >
              إغلاق
            </button>
          </div>
          <TeacherWardForm
            key={active.id}
            student={active}
            onSaved={(next) => markSaved(active.id, next)}
          />
        </section>
      ) : (
        <ul className="space-y-2">
          {roster.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setActiveId(s.id)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 text-right transition-colors duration-200 hover:bg-muted"
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold text-foreground">{s.name}</span>
                  {s.recordedToday && s.lastSummary && (
                    <span className="block truncate text-xs text-muted-foreground">{s.lastSummary}</span>
                  )}
                </span>
                {s.recordedToday || justSaved.includes(s.id) ? (
                  <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-ink">
                    سُجِّل اليوم ✓
                  </span>
                ) : (
                  <span className="shrink-0 text-sm font-semibold text-primary">سجّل ورداً ←</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {active === null && justSaved.length > 0 && (
        <div className="rounded-2xl border border-success/40 bg-surface p-4 text-sm text-success">
          اعتُمدت أوراد {justSaved.length} طالباً هذه الجلسة ✓
        </div>
      )}

      {active === null && roster.every((s) => s.recordedToday || justSaved.includes(s.id)) && (
        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => window.location.reload()}>
            تحديث القائمة
          </Button>
        </div>
      )}
    </div>
  );
}
