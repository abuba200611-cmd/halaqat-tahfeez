"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty, Stat } from "@/components/ui";
import { juzLabel } from "@/lib/quran";
import {
  DEFAULT_WEEKDAYS,
  MONTH_NAMES,
  WEEKDAY_NAMES,
  generateMonthlySchedule,
  toSavedSchedule,
} from "@/lib/schedule";
import { useStudents } from "@/lib/store";
import type { SavedSchedule, SavedScheduleInfo } from "@/lib/schedule";

/** الجدول المعروض: مولّد الآن (غير محفوظ) أو مفتوح من المحفوظات */
type View = {
  schedule: SavedSchedule;
  source: "generated" | "saved";
};

export default function SchedulePage() {
  const { students, loading } = useStudents();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [weekdays, setWeekdays] = useState<number[]>(DEFAULT_WEEKDAYS);
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [saved, setSaved] = useState<SavedScheduleInfo[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshSaved = useCallback(async () => {
    try {
      const res = await fetch("/api/schedules");
      if (!res.ok) return;
      const data = (await res.json()) as { schedules?: SavedScheduleInfo[] };
      setSaved(data.schedules ?? []);
    } catch {
      // قائمة المحفوظات ثانوية — لا نُظهر خطأ إن تعذّر جلبها
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/schedules")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { schedules?: SavedScheduleInfo[] } | null) => {
        if (active && data) setSaved(data.schedules ?? []);
      })
      .catch(() => {
        // قائمة المحفوظات ثانوية — لا نُظهر خطأ إن تعذّر جلبها
      });
    return () => {
      active = false;
    };
  }, []);

  const active = students.filter((s) => s.active);

  if (loading) {
    return <Empty title="جارٍ تحميل الطلاب…" />;
  }

  if (students.length === 0) {
    return <Empty title="أضف الطلاب أولاً، ثم عُد لتوليد جدول الشهر." />;
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  function run() {
    try {
      setError(null);
      setSaveError(null);
      setNotice(null);
      const generated = generateMonthlySchedule(students, year, month, weekdays);
      setView({ schedule: toSavedSchedule(generated), source: "generated" });
    } catch (err) {
      setView(null);
      setError(err instanceof Error ? err.message : "تعذّر توليد الجدول");
    }
  }

  async function save() {
    if (!view) return;
    setSaving(true);
    setSaveError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schedule: view.schedule }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(data.error ?? "تعذّر حفظ الجدول");
        return;
      }
      setView({ schedule: view.schedule, source: "saved" });
      setNotice("اعتُمد الجدول وحُفظ.");
      await refreshSaved();
    } catch {
      setSaveError("تعذّر الاتصال بالخادم");
    } finally {
      setSaving(false);
    }
  }

  async function openSaved(id: number) {
    setError(null);
    setSaveError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/schedules?id=${id}`);
      if (!res.ok) {
        setError("تعذّر فتح الجدول المحفوظ");
        return;
      }
      const data = (await res.json()) as { schedule?: { schedule: SavedSchedule } };
      const record = data.schedule;
      if (!record) return;
      setYear(record.schedule.year);
      setMonth(record.schedule.month);
      setWeekdays(record.schedule.weekdays);
      setView({ schedule: record.schedule, source: "saved" });
    } catch {
      setError("تعذّر الاتصال بالخادم");
    }
  }

  async function deleteSaved(id: number) {
    try {
      const res = await fetch("/api/schedules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) await refreshSaved();
    } catch {
      // لا شيء — القائمة ستبقى كما هي
    }
  }

  const schedule = view?.schedule ?? null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-naskh text-2xl font-bold">جدول الشهر</h1>
        <div className="no-print flex flex-wrap gap-2">
          <Button onClick={run}>توليد الجدول</Button>
          {view?.source === "generated" && (
            <Button variant="ghost" onClick={save} disabled={saving}>
              {saving ? "يُحفظ…" : "اعتماد وحفظ"}
            </Button>
          )}
          {schedule && (
            <Button variant="ghost" onClick={() => window.print()}>
              طباعة
            </Button>
          )}
        </div>
      </div>

      <Card className="no-print p-4">
        <h2 className="mb-3 text-sm font-semibold">إعدادات الجدول</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs text-muted-foreground">الشهر</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="mt-1 w-full cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {MONTH_NAMES.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs text-muted-foreground">السنة</span>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="tabular mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
        </div>

        <div className="mt-4">
          <span className="text-xs text-muted-foreground">أيام الحلقة في الأسبوع</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAY_NAMES.map((name, day) => {
              const on = weekdays.includes(day);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggleWeekday(day)}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    on
                      ? "border-primary bg-primary text-on-primary"
                      : "border-border bg-surface text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {saved.length > 0 && (
        <Card className="no-print p-4">
          <h2 className="mb-3 text-sm font-semibold">الجداول المحفوظة</h2>
          <ul className="divide-y divide-border">
            {saved.map((row) => {
              const isOpen =
                view?.source === "saved" &&
                schedule?.year === row.year &&
                schedule?.month === row.month;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <div>
                    <span className="text-sm font-medium">
                      {MONTH_NAMES[row.month - 1]} {row.year}
                    </span>
                    {isOpen && (
                      <span className="mr-2">
                        <Badge tone="good">مفتوح</Badge>
                      </span>
                    )}
                    <span className="tabular mr-2 text-xs text-muted-foreground">
                      اعتُمد {row.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openSaved(row.id)}
                      className="cursor-pointer rounded px-2 py-1 text-xs text-primary transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      فتح
                    </button>
                    <button
                      onClick={() => deleteSaved(row.id)}
                      className="cursor-pointer rounded px-2 py-1 text-xs text-destructive transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      حذف
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {notice && (
        <Card className="no-print border-primary/40 p-4">
          <p className="text-sm text-primary">{notice}</p>
        </Card>
      )}

      {saveError && (
        <Card className="no-print border-destructive/40 p-4">
          <p className="text-sm text-destructive">{saveError}</p>
        </Card>
      )}

      {error && (
        <Card className="border-destructive/40 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {!schedule ? (
        !error && (
          <Empty
            title={`جاهز — ${active.length} طالباً نشطاً. اختر الشهر وأيام الحلقة، ثم اضغط «توليد الجدول».`}
          />
        )
      ) : (
        <>
          {view?.source === "saved" && (
            <p className="no-print text-xs text-muted-foreground">
              جدول محفوظ لِـ {schedule.monthName} {schedule.year} — الأسماء والثنائيات كما
              اعتُمدت، لا كما تغيّرت بيانات الطلاب بعدها.
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="لقاءات الشهر"
              value={schedule.sessionCount}
              hint={`${schedule.monthName} ${schedule.year}`}
            />
            <Stat
              label="ثنائيات مختلفة"
              value={schedule.uniquePairs.toLocaleString("en")}
              hint={`أكثر تكرار لثنائية: ${schedule.maxRepeat}`}
            />
            <Stat label="الطلاب النشطون" value={schedule.studentCount} />
            <Stat
              label="زمن التوليد"
              value={`${schedule.elapsedMs} م.ث`}
              hint={`${schedule.candidateCount.toLocaleString("en")} ثنائية ممكنة`}
            />
          </div>

          {schedule.teacherTurns.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-1 font-naskh text-lg font-bold">التسميع للمعلّم</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                من لم يجد شريكاً في بعض الأيام. البرنامج يوزّع الدور بالتناوب، فيُفترض
                تقارب الأعداد — وتباعُدها يعني أن مقرر أحدهم لا يشاركه فيه أحد.
              </p>
              <div className="flex flex-wrap gap-2">
                {schedule.teacherTurns.map(({ student, times }) => (
                  <span key={student.id} className="text-sm">
                    <Badge tone={times > schedule.sessionCount / 2 ? "warn" : "neutral"}>
                      {student.name} · {times}
                    </Badge>
                  </span>
                ))}
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {schedule.days.map((day) => (
              <Card key={day.date} className="print-block overflow-hidden">
                <div className="flex items-baseline justify-between border-b border-border bg-muted/50 px-4 py-2">
                  <h3 className="font-naskh font-bold">{day.weekdayName}</h3>
                  <span className="tabular text-xs text-muted-foreground">{day.date}</span>
                </div>

                <ol className="grid gap-x-6 gap-y-1 px-4 py-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                  {day.pairs.map((pair, index) => (
                    <li key={`${pair.a.id}-${pair.b.id}`} className="flex items-baseline gap-2">
                      <span className="tabular w-6 shrink-0 text-xs text-muted-foreground">
                        {index + 1}
                      </span>
                      <span className="flex-1">
                        {pair.a.name} ↔ {pair.b.name}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {juzLabel(pair.overlapJuz)}
                      </span>
                    </li>
                  ))}
                </ol>

                {day.unmatched.length > 0 && (
                  <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                    يسمّع للمعلّم: {day.unmatched.map((s) => s.name).join("، ")}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
