"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { hijriMonthOfISO, monthLabel, shiftMonthKey } from "@/lib/hijri";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { sheetToCsv } from "@/lib/discipline";
import type { MonthlySheetData } from "@/lib/discipline-db";

/*
  A2 — كشف المتابعة الشهري للحلقة: حضور/غياب/استئذان، صفحات الحفظ
  والمراجعة، تقدّم الخطة، الاختبارات (إن وُجدت)، وأحداث الانضباط —
  لكل طالب. قابل للطباعة (A4) وللتصدير CSV، ويسلّمه المعلّم لإدارة الجامع.
*/

type SheetResponse = { sheet: MonthlySheetData; halaqahName: string; mosqueName: string };

const STATUS_LABEL: Record<MonthlySheetData["status"], string> = {
  draft: "مسوّدة",
  submitted: "مُسلَّم للإدارة",
  reviewed: "مراجَع",
};
const STATUS_TONE: Record<MonthlySheetData["status"], "neutral" | "good" | "warn"> = {
  draft: "neutral",
  submitted: "warn",
  reviewed: "good",
};

const PLAN_STATUS_LABEL: Record<string, string> = {
  ahead: "متقدّم",
  on_track: "على المسار",
  behind: "متأخر",
};

export default function TeacherSheetPage() {
  const [month, setMonth] = useState(() => hijriMonthOfISO(riyadhTodayISO()));
  const [data, setData] = useState<SheetResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    fetch(`/api/discipline/sheet?month=${encodeURIComponent(month)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((d: SheetResponse) => {
        if (!cancelled) {
          setData(d);
          setNotes(d.sheet.notes ?? "");
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => load(), [load]);

  async function action(kind: "submit" | "reopen") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/discipline/sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, action: kind, notes: notes.trim() || undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(d.error ?? "تعذّر التنفيذ");
        return;
      }
      load();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  function downloadCsv() {
    if (!data) return;
    const header = [
      "الطالب",
      "حاضر",
      "متأخر",
      "مستأذن",
      "غائب",
      "غير مسجَّل",
      "صفحات حفظ",
      "صفحات مراجعة",
      "مستهدف حفظ",
      "مستهدف مراجعة",
      "نسبة الخطة",
      "الاختبارات",
      "أحداث انضباط",
    ];
    const rows = data.sheet.students.map((s) => [
      s.name,
      s.attendance.present,
      s.attendance.late,
      s.attendance.excused,
      s.attendance.absent,
      s.attendance.unmarked,
      s.hifzPages,
      s.reviewPages,
      s.plan?.hifzTarget ?? "",
      s.plan?.reviewTarget ?? "",
      s.plan?.overallPct !== null && s.plan?.overallPct !== undefined ? `${s.plan.overallPct}%` : "",
      s.examsPassed ?? "",
      s.disciplineEvents,
    ]);
    // BOM حتى تفتح العربية سليمة في Excel
    const blob = new Blob([`\uFEFF${sheetToCsv(header, rows)}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `كشف-المتابعة-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const label = useMemo(() => monthLabel(month), [month]);

  if (failed) {
    return (
      <Empty
        title="تعذّر تحميل الكشف — الانضباط غير مفعّل لهذا الجامع؟"
        action={
          <Link href="/discipline" className="text-sm text-primary hover:underline">
            العودة للانضباط
          </Link>
        }
      />
    );
  }
  if (!data) return <Empty title="جارٍ التحميل…" />;

  const sheet = data.sheet;
  const prev = shiftMonthKey(month, -1);
  const next = shiftMonthKey(month, 1);

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-naskh text-2xl font-bold">كشف المتابعة الشهري</h1>
            <p className="text-xs text-muted-foreground">
              {data.mosqueName} — {data.halaqahName} · {label}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => prev && setMonth(prev)} disabled={!prev} aria-label="الشهر السابق">
              ←
            </Button>
            <span className="min-w-32 text-center text-sm font-semibold">{label}</span>
            <Button variant="ghost" onClick={() => next && setMonth(next)} disabled={!next} aria-label="الشهر التالي">
              →
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[sheet.status]}>{STATUS_LABEL[sheet.status]}</Badge>
          <Button variant="ghost" onClick={() => window.print()}>
            طباعة
          </Button>
          <Button variant="ghost" onClick={downloadCsv}>
            تصدير CSV
          </Button>
          {sheet.status !== "reviewed" && (
            <>
              <Button onClick={() => action("submit")} disabled={busy}>
                {sheet.status === "draft" ? "تسليم للإدارة" : "إعادة التسليم"}
              </Button>
              {sheet.status === "submitted" && (
                <Button variant="ghost" onClick={() => action("reopen")} disabled={busy}>
                  فتح للتعديل
                </Button>
              )}
            </>
          )}
        </div>

        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <Card className="space-y-2 p-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">ملاحظات تُسلَّم مع الكشف (اختياري)</span>
            <textarea
              value={notes}
              maxLength={500}
              rows={2}
              disabled={sheet.status === "reviewed"}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
            />
          </label>
        </Card>
      </div>

      <SheetTable sheet={sheet} label={label} halaqahName={data.halaqahName} mosqueName={data.mosqueName} />
    </div>
  );
}

/** الجدول نفسه يظهر على الشاشة وفي الطباعة (A4 RTL) */
function SheetTable({
  sheet,
  label,
  halaqahName,
  mosqueName,
}: {
  sheet: MonthlySheetData;
  label: string;
  halaqahName: string;
  mosqueName: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>
      <div className="hidden p-4 text-center print:block">
        <p className="font-naskh text-xl font-bold">جامع {mosqueName}</p>
        <p className="text-sm">
          كشف المتابعة الشهري — حلقة {halaqahName} — {label}
        </p>
      </div>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border bg-muted text-right">
            <th className="px-2 py-2 font-semibold">الطالب</th>
            <th className="px-2 py-2 font-semibold">حاضر</th>
            <th className="px-2 py-2 font-semibold">متأخر</th>
            <th className="px-2 py-2 font-semibold">مستأذن</th>
            <th className="px-2 py-2 font-semibold">غائب</th>
            <th className="px-2 py-2 font-semibold">حفظ</th>
            <th className="px-2 py-2 font-semibold">مراجعة</th>
            <th className="px-2 py-2 font-semibold">الخطة</th>
            {sheet.examsAvailable && <th className="px-2 py-2 font-semibold">اختبارات</th>}
            <th className="px-2 py-2 font-semibold">انضباط</th>
          </tr>
        </thead>
        <tbody>
          {sheet.students.length === 0 ? (
            <tr>
              <td colSpan={sheet.examsAvailable ? 10 : 9} className="px-2 py-6 text-center text-muted-foreground">
                لا طلاب في الحلقة.
              </td>
            </tr>
          ) : (
            sheet.students.map((s) => (
              <tr key={s.studentId} className="border-b border-border/60 text-right">
                <td className="px-2 py-1.5">
                  {s.name}
                  {!s.active && <span className="text-xs text-muted-foreground"> (غير فعّال)</span>}
                </td>
                <td className="tabular px-2 py-1.5">{s.attendance.present}</td>
                <td className="tabular px-2 py-1.5">{s.attendance.late}</td>
                <td className="tabular px-2 py-1.5">{s.attendance.excused}</td>
                <td className="tabular px-2 py-1.5 text-red-700">{s.attendance.absent}</td>
                <td className="tabular px-2 py-1.5">{s.hifzPages}</td>
                <td className="tabular px-2 py-1.5">{s.reviewPages}</td>
                <td className="px-2 py-1.5">
                  {s.plan ? (
                    <span className="tabular">
                      {s.plan.overallPct !== null ? `${s.plan.overallPct}%` : "—"}
                      {s.plan.status && <span className="text-xs text-muted-foreground"> ({PLAN_STATUS_LABEL[s.plan.status] ?? s.plan.status})</span>}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">بلا خطة</span>
                  )}
                </td>
                {sheet.examsAvailable && <td className="tabular px-2 py-1.5">{s.examsPassed ?? "—"}</td>}
                <td className="tabular px-2 py-1.5">{s.disciplineEvents}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
