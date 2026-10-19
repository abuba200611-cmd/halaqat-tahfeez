"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Empty } from "@/components/ui";
import { QrCheckinPanel } from "@/components/qr-checkin-panel";
import {
  ATTENDANCE_LABEL,
  ATTENDANCE_NOTE_MAX,
  ATTENDANCE_STATUSES,
  countAttendance,
  type AttendanceRow,
  type AttendanceStatus,
} from "@/lib/attendance";
import { riyadhTodayISO } from "@/lib/riyadh-date";

type DayState = { date: string; rows: AttendanceRow[] };

const TONE: Record<AttendanceStatus, { on: string; off: string }> = {
  present: { on: "border-success bg-success text-white", off: "border-border bg-surface text-foreground hover:bg-success-soft" },
  late: { on: "border-secondary bg-secondary text-on-secondary", off: "border-border bg-surface text-foreground hover:bg-accent-soft" },
  excused: { on: "border-sand bg-sand text-on-secondary", off: "border-border bg-surface text-foreground hover:bg-accent-soft" },
  absent: { on: "border-destructive bg-destructive text-white", off: "border-border bg-surface text-foreground hover:bg-destructive-soft" },
};

async function putAttendance(date: string, studentId: string, status: AttendanceStatus, note?: string): Promise<boolean> {
  try {
    const res = await fetch("/api/attendance", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, studentId, status, ...(note !== undefined ? { note } : {}) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function AttendancePage() {
  const today = riyadhTodayISO();
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<DayState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [qrEnabled, setQrEnabled] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // هل ميزة «حضور بالرمز» مفعّلة لجامع الحلقة؟ (تظهر الزر فقط حينها)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/attendance/qr?probe=1")
      .then((res) => (res.ok ? res.json() : { enabled: false }))
      .then((data: { enabled?: boolean }) => {
        if (!cancelled) setQrEnabled(data.enabled === true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const qrLive = qrEnabled && qrOpen && date === today;

  // القائمة الحيّة: أثناء فتح اللوحة نعيد جلب حضور اليوم كل ٥ ثوانٍ
  useEffect(() => {
    if (!qrLive) return;
    const id = setInterval(() => setReload((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, [qrLive]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/attendance?date=${encodeURIComponent(date)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((data: { rows: AttendanceRow[] }) => {
        if (cancelled) return;
        setDay({ date, rows: data.rows });
        setFailed(null);
      })
      .catch(() => {
        if (!cancelled) setFailed(date);
      });
    return () => {
      cancelled = true;
    };
  }, [date, reload]);

  const loading = day?.date !== date && failed !== date;
  const rows = day?.date === date ? day.rows : [];

  const patchRow = useCallback((studentId: string, patch: Partial<AttendanceRow>) => {
    setDay((prev) =>
      prev ? { ...prev, rows: prev.rows.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)) } : prev,
    );
  }, []);

  /** تحديث تفاؤلي فوري، وعند فشل الحفظ نعيد الجلب من الخادم لنُظهر الحقيقة */
  async function setStatus(row: AttendanceRow, status: AttendanceStatus) {
    if (row.status === status && !row.implicit) return;
    setError(null);
    patchRow(row.studentId, { status, implicit: false });
    if (!(await putAttendance(date, row.studentId, status))) {
      setError("تعذّر حفظ آخر تغيير — أعدنا تحميل القائمة.");
      setReload((n) => n + 1);
    }
  }

  async function saveNote(row: AttendanceRow, note: string) {
    if (!row.status) return;
    setError(null);
    if (!(await putAttendance(date, row.studentId, row.status, note))) {
      setError("تعذّر حفظ الملاحظة — أعدنا تحميل القائمة.");
      setReload((n) => n + 1);
    }
  }

  async function markAll() {
    setError(null);
    // تفاؤلي: من بلا قرار (حتى الضمني) يصير حاضراً؛ غير ذلك لا يُمسّ — مثل الخادم تماماً
    setDay((prev) =>
      prev
        ? { ...prev, rows: prev.rows.map((r) => (r.status === null ? { ...r, status: "present", implicit: false } : r)) }
        : prev,
    );
    try {
      const res = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, action: "markAllPresent" }),
      });
      if (!res.ok) throw new Error("save");
    } catch {
      setError("تعذّر تحديد الكل — أعدنا تحميل القائمة.");
    }
    setReload((n) => n + 1);
  }

  const counts = countAttendance(rows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">الحضور</h1>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="تاريخ الحضور"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {qrEnabled && date === today && (
            <button
              type="button"
              onClick={() => setQrOpen((v) => !v)}
              aria-pressed={qrOpen}
              className="min-h-11 cursor-pointer rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-semibold transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              حضور بالرمز
            </button>
          )}
          <button
            type="button"
            onClick={markAll}
            disabled={loading || rows.length === 0}
            className="cursor-pointer rounded-md bg-success px-3 py-1.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
          >
            تحديد الكل حاضر
          </button>
        </div>
      </div>

      {qrLive && <QrCheckinPanel rows={rows} onClose={() => setQrOpen(false)} />}

      {error && <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}

      {loading ? (
        <Empty title="جارٍ تحميل الحضور…" />
      ) : failed === date && day?.date !== date ? (
        <Empty title="تعذّر تحميل الحضور." />
      ) : rows.length === 0 ? (
        <Empty title="لا طلاب فعّالون في الحلقة." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {ATTENDANCE_STATUSES.map((s) => (
              <Card key={s} className="p-3 text-center">
                <div className="tabular text-xl font-bold">{counts[s]}</div>
                <div className="text-xs text-muted-foreground">{ATTENDANCE_LABEL[s]}</div>
              </Card>
            ))}
            <Card className="p-3 text-center">
              <div className="tabular text-xl font-bold">{counts.unmarked}</div>
              <div className="text-xs text-muted-foreground">لم يُحدَّد</div>
            </Card>
          </div>

          <ul className="space-y-2">
            {rows.map((row) => (
              <AttendanceItem key={`${date}:${row.studentId}`} row={row} onStatus={setStatus} onNote={saveNote} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AttendanceItem({
  row,
  onStatus,
  onNote,
}: {
  row: AttendanceRow;
  onStatus: (row: AttendanceRow, status: AttendanceStatus) => void;
  onNote: (row: AttendanceRow, note: string) => void;
}) {
  // الملاحظة محلية أثناء الكتابة وتُحفظ عند مغادرة الحقل؛ تعاد تهيئتها حين تتغيّر ملاحظة الخادم (key)
  const [note, setNote] = useState(row.note);
  const [savedNote, setSavedNote] = useState(row.note);

  return (
    <li>
      <Card className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{row.name}</span>
          {row.implicit && <span className="text-xs text-muted-foreground">حاضر — أرسل ورده</span>}
          {row.viaQr && <span className="text-xs text-success">سجّل بالرمز</span>}
        </div>
        <div className="grid grid-cols-4 gap-2">
          {ATTENDANCE_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={row.status === s}
              onClick={() => onStatus(row, s)}
              className={`min-h-11 cursor-pointer rounded-lg border px-1 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                row.status === s ? TONE[s].on : TONE[s].off
              }`}
            >
              {ATTENDANCE_LABEL[s]}
            </button>
          ))}
        </div>
        <input
          value={note}
          maxLength={ATTENDANCE_NOTE_MAX}
          disabled={!row.status}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note.trim() === savedNote.trim()) return;
            setSavedNote(note);
            onNote(row, note);
          }}
          placeholder={row.status ? "ملاحظة (اختياري)" : "حدّد الحالة أولاً لإضافة ملاحظة"}
          aria-label={`ملاحظة ${row.name}`}
          className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </Card>
    </li>
  );
}
