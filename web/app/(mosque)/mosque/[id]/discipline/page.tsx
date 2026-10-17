"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage } from "@/components/mosque/mosque-page";
import { useApi, callApi } from "@/components/mosque/use-api";
import { DISCIPLINE_COMMITTEE_NOTE_MAX, eventLabel, type DisciplineConfig } from "@/lib/discipline";
import type { DisciplineEventRow, SuspensionRow } from "@/lib/discipline-db";
import type { Halaqah } from "@/lib/mosque/db";

/*
  A2 — الانضباط لإدارة الجامع: التنبيهات الحرجة غير المقروءة أولاً، ثم
  كل أحداث الحلقات والإيقافات السارية، والفصل النهائي (من هنا فقط وبملاحظة
  لجنة). الإعدادات في صفحتها وكشوف المتابعة كذلك.
*/

type DisciplineData = {
  config: DisciplineConfig;
  events: DisciplineEventRow[];
  suspensions: SuspensionRow[];
  criticalAlerts: number;
};

export default function MosqueDisciplinePage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/discipline`} title="الانضباط والمتابعة">
      <DisciplinePanel mosqueId={mosqueId} />
    </MosquePage>
  );
}

function DisciplinePanel({ mosqueId }: { mosqueId: number }) {
  const { data, status, loading, reload } = useApi<DisciplineData>(`/api/mosques/${mosqueId}/discipline`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/mosque/${mosqueId}/discipline/settings`}
          className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
        >
          إعدادات السُلّم
        </Link>
        <Link
          href={`/mosque/${mosqueId}/discipline/sheets`}
          className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
        >
          كشوف المتابعة الشهرية
        </Link>
      </div>

      <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الانضباط والمتابعة" />
      {data && (
        <>
          {data.criticalAlerts > 0 && (
            <Card className="border-accent/40 bg-accent/5 p-4">
              <p className="font-semibold text-accent">🚨 {data.criticalAlerts} تنبيهاً حرجاً بانتظار الاطلاع</p>
              <p className="mt-1 text-xs text-muted-foreground">
                طلاب تجاوزوا عتبة الغياب الحرجة ({data.config.absence.adminAlertConsecutiveDays} أيام متتالية) —
                اطّلع على التنبيهات بالسجل وأقرّ باستلامها.
              </p>
            </Card>
          )}

          <DismissalForm mosqueId={mosqueId} onDone={reload} />

          {data.suspensions.length > 0 && (
            <Card className="space-y-2 p-4">
              <h2 className="font-semibold">الإيقافات السارية</h2>
              <ul className="space-y-1 text-sm">
                {data.suspensions.map((s) => (
                  <li key={`${s.halaqahId}:${s.studentId}`} className="flex items-center justify-between gap-2">
                    <span>
                      {s.studentName} <span className="text-xs text-muted-foreground">— {s.halaqahName}</span>
                    </span>
                    <span className="tabular text-xs text-muted-foreground">حتى {s.until.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <section className="space-y-3">
            <h2 className="font-naskh text-lg font-bold">سجلّ الأحداث ({data.events.length})</h2>
            {data.events.length === 0 ? (
              <Empty title="لا أحداث انضباط في الجامع بعد." />
            ) : (
              <ul className="space-y-2">
                {data.events.map((event) => (
                  <EventRow key={event.id} mosqueId={mosqueId} event={event} onAck={reload} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function EventRow({ mosqueId, event, onAck }: { mosqueId: number; event: DisciplineEventRow; onAck: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <li>
      <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">{event.studentName}</span>
          <span className="text-xs text-muted-foreground">{event.halaqahName}</span>
          <Badge tone={event.kind === "admin_alert" && !event.acknowledgedAt ? "warn" : "neutral"}>
            {eventLabel(event.kind, event.level)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {event.origin === "auto" ? "تلقائي" : "يدوي"} · {event.createdAt.slice(0, 10)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {event.kind === "dismissal" && <span className="text-xs text-red-700">مفصول</span>}
          {event.acknowledgedAt ? (
            <span className="text-xs text-emerald-700">مُستلم</span>
          ) : (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await callApi(`/api/mosques/${mosqueId}/discipline/events/${event.id}`, "PATCH");
                setBusy(false);
                onAck();
              }}
            >
              إقرار
            </Button>
          )}
        </div>
        {event.reason && <p className="w-full text-xs text-muted-foreground">{event.reason}</p>}
      </Card>
    </li>
  );
}

function DismissalForm({ mosqueId, onDone }: { mosqueId: number; onDone: () => void }) {
  const { data: halaqat } = useApi<{ halaqahs: Halaqah[] }>(`/api/mosques/${mosqueId}/halaqahs`);
  const [halaqahId, setHalaqahId] = useState("");
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [studentId, setStudentId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!halaqahId) return;
    let cancelled = false;
    fetch(`/api/mosques/${mosqueId}/discipline/students?halaqahId=${halaqahId}`)
      .then((res) => (res.ok ? res.json() : { students: [] }))
      .then((d: { students?: { id: string; name: string }[] }) => {
        if (!cancelled) setStudents(d.students ?? []);
      })
      .catch(() => {
        if (!cancelled) setStudents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mosqueId, halaqahId]);

  async function submit() {
    setBusy(true);
    setError(null);
    setDone(null);
    const res = await callApi(`/api/mosques/${mosqueId}/discipline/dismissal`, "POST", {
      halaqahId: Number(halaqahId),
      studentId,
      committeeNote: note,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setDone("تم الفصل النهائي وتسجيل الحدث بملاحظة اللجنة.");
    setNote("");
    onDone();
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-naskh text-lg font-bold">فصل نهائي</h2>
        <p className="text-xs text-muted-foreground">
          من إدارة الجامع فقط، بملاحظة لجنة إلزامية — الطالب يصير غير فعّال بلا استرجاع.
        </p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-emerald-700">{done}</p>}
      <div className="grid gap-2 sm:grid-cols-3">
        <select value={halaqahId} onChange={(e) => {
          setHalaqahId(e.target.value);
          setStudentId("");
          setStudents([]);
        }} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm" aria-label="الحلقة">
          <option value="">— الحلقة —</option>
          {(halaqat?.halaqahs ?? []).map((h) => (
            <option key={h.id} value={h.id}>
              {h.halaqahName}
            </option>
          ))}
        </select>
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)} disabled={!halaqahId} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm" aria-label="الطالب">
          <option value="">— الطالب —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          value={note}
          maxLength={DISCIPLINE_COMMITTEE_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ملاحظة اللجنة (إلزامية)"
          aria-label="ملاحظة اللجنة"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        />
      </div>
      <Button onClick={submit} disabled={busy || !halaqahId || !studentId || note.trim().length < 10}>
        {busy ? "جارٍ التنفيذ…" : "تنفيذ الفصل"}
      </Button>
    </Card>
  );
}
