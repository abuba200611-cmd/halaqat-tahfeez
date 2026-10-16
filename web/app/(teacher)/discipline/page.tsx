"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/ui";
import {
  DISCIPLINE_NOTE_MAX,
  DOC_KIND_LABEL,
  VIOLATION_STEPS,
  docKindsForEvent,
  eventLabel,
  type DisciplineConfig,
  type DisciplineEventKind,
} from "@/lib/discipline";
import type { DisciplineEventRow, SuspensionRow } from "@/lib/discipline-db";

/*
  A2 — الانضباط والمتابعة للمعلّم: تسجيل المخالفات (والنظام يقترح درجة
  السُلّم التالية)، وأحداث سُلّم الغياب الآلية مع إقرارات الاستلام،
  والإيقافات السارية، وروابط طباعة المستندات وكشف المتابعة الشهري.
*/

type Student = { id: string; name: string; active: boolean };

type DisciplineData = {
  config: DisciplineConfig;
  mosqueName: string;
  halaqahName: string;
  events: DisciplineEventRow[];
  students: Student[];
  suspensions: SuspensionRow[];
};

const EVENT_TONE: Record<DisciplineEventKind, "neutral" | "good" | "warn"> = {
  absence_warning: "warn",
  parent_summons: "warn",
  admin_alert: "warn",
  violation: "neutral",
  dismissal: "warn",
};

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export default function TeacherDisciplinePage() {
  const [data, setData] = useState<DisciplineData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/discipline")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((d: DisciplineData) => {
        if (!cancelled) {
          setData(d);
          setFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  if (failed) {
    return (
      <Empty
        title="الانضباط غير مفعّل أو تعذّر التحميل."
        action={
          <Link href="/suggest" className="text-sm text-primary hover:underline">
            بلاغ إلى المطوّر
          </Link>
        }
      />
    );
  }
  if (!data) return <Empty title="جارٍ التحميل…" />;

  const unacked = data.events.filter((e) => e.acknowledgedAt === null).length;
  const suspendedBy = new Map(data.suspensions.map((s) => [`${s.halaqahId}:${s.studentId}`, s]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-naskh text-2xl font-bold">الانضباط والمتابعة</h1>
          <p className="text-xs text-muted-foreground">
            {data.mosqueName} — {data.halaqahName}
          </p>
        </div>
        <Link
          href="/discipline/sheet"
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-semibold transition-colors duration-200 hover:bg-muted"
        >
          كشف المتابعة الشهري
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card className="p-3 text-center">
          <div className="tabular text-xl font-bold">{data.events.length}</div>
          <div className="text-xs text-muted-foreground">حدثاً</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="tabular text-xl font-bold text-amber-600">{unacked}</div>
          <div className="text-xs text-muted-foreground">بانتظار الإقرار</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="tabular text-xl font-bold text-red-600">{data.suspensions.length}</div>
          <div className="text-xs text-muted-foreground">إيقاف سارٍ</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="tabular text-xl font-bold">
            {data.config.absence.warn1ConsecutiveDays} / {data.config.absence.warn2TermAbsences}
          </div>
          <div className="text-xs text-muted-foreground">حدّا الإنذار (تتالي/فصل)</div>
        </Card>
      </div>

      <ViolationForm students={data.students} categories={data.config.violations.categories} onSaved={() => setReload((n) => n + 1)} />

      {data.suspensions.length > 0 && (
        <Card className="space-y-2 p-3">
          <h2 className="text-sm font-semibold">الإيقافات السارية</h2>
          <ul className="space-y-1 text-sm">
            {data.suspensions.map((s) => (
              <li key={`${s.halaqahId}:${s.studentId}`} className="flex items-center justify-between gap-2">
                <span>
                  {s.studentName} <span className="text-xs text-muted-foreground">({s.days} أيام)</span>
                </span>
                <span className="tabular text-xs text-muted-foreground">حتى {s.until.slice(0, 10)}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            يُستعاد الطالب تلقائياً عند انتهاء المدة — يتحقق النظام عند فتح هذه الصفحة.
          </p>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="font-naskh text-lg font-bold">سجلّ الأحداث</h2>
        {data.events.length === 0 ? (
          <Empty title="لا أحداث انضباط بعد — السجل يبدأ فارغاً." />
        ) : (
          <ul className="space-y-2">
            {data.events.map((event) => (
              <EventItem
                key={event.id}
                event={event}
                suspension={suspendedBy.get(`${event.halaqahId}:${event.studentId}`)}
                onAck={async () => {
                  await fetch(`/api/discipline/events/${event.id}`, { method: "PATCH" }).catch(() => null);
                  setReload((n) => n + 1);
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ViolationForm({
  students,
  categories,
  onSaved,
}: {
  students: Student[];
  categories: string[];
  onSaved: () => void;
}) {
  const [studentId, setStudentId] = useState("");
  const [category, setCategory] = useState(categories[0] ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ stepLabel: string; suspensionUntil: string | null } | null>(null);

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] ?? "");
  }, [categories, category]);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/discipline/violation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, category, note: note.trim() || undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as {
        error?: string;
        stepLabel?: string;
        suspensionUntil?: string | null;
      };
      if (!res.ok) {
        setError(d.error ?? "تعذّر حفظ المخالفة");
        return;
      }
      setResult({ stepLabel: d.stepLabel ?? "", suspensionUntil: d.suspensionUntil ?? null });
      setNote("");
      onSaved();
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-naskh text-lg font-bold">تسجيل مخالفة</h2>
        <p className="text-xs text-muted-foreground">
          الإجراء التالي يقترحه النظام تلقائياً بحسب سُلّم الجامع:{" "}
          {VIOLATION_STEPS.map((s) => s.labelAr).join(" ← ")}
        </p>
      </div>
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {result && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          سُجّلت المخالفة — الإجراء المقترح: <strong>{result.stepLabel}</strong>
          {result.suspensionUntil && <> — إيقاف حتى {result.suspensionUntil.slice(0, 10)}</>}
        </p>
      )}
      {students.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا طلاب في الحلقة بعد.</p>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">الطالب</span>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              >
                <option value="">— اختر طالباً —</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.active ? "" : " (غير فعّال)"}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">التصنيف</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <input
            value={note}
            maxLength={DISCIPLINE_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="تفاصيل إضافية (اختياري)"
            aria-label="تفاصيل المخالفة"
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm"
          />
          <Button onClick={submit} disabled={busy || !studentId || !category}>
            {busy ? "جارٍ الحفظ…" : "تسجيل المخالفة"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function EventItem({
  event,
  suspension,
  onAck,
}: {
  event: DisciplineEventRow;
  suspension?: SuspensionRow;
  onAck: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const docs = docKindsForEvent(event.kind, event.level);

  return (
    <li>
      <Card className="space-y-2 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{event.studentName}</span>
            <Badge tone={EVENT_TONE[event.kind]}>{eventLabel(event.kind, event.level)}</Badge>
            <span className="text-xs text-muted-foreground">
              {event.origin === "auto" ? "تلقائي" : "يدوي"} · {formatDate(event.createdAt)}
            </span>
          </div>
          {event.acknowledgedAt ? (
            <span className="text-xs text-emerald-700">مُستلم {formatDate(event.acknowledgedAt)}</span>
          ) : (
            <Button
              variant="ghost"
              onClick={async () => {
                setBusy(true);
                await onAck();
                setBusy(false);
              }}
              disabled={busy}
            >
              إقرار بالاستلام
            </Button>
          )}
        </div>
        {event.reason && <p className="text-sm text-slate-600">{event.reason}</p>}
        {suspension && (
          <p className="text-xs text-red-700">
            موقوف حتى {suspension.until.slice(0, 10)} — يُستعاد تلقائياً بعدها.
          </p>
        )}
        {docs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {docs.map((doc) => (
              <Link
                key={doc}
                href={`/discipline/print?event=${event.id}&doc=${doc}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold transition-colors duration-200 hover:bg-muted"
              >
                طباعة {DOC_KIND_LABEL[doc]}
              </Link>
            ))}
          </div>
        )}
      </Card>
    </li>
  );
}
