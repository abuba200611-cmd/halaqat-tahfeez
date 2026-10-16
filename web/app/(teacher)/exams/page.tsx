"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { useStudents } from "@/lib/store";
import { NOMINATION_STATUS_LABELS, juzRangeLabel, type NominationStatus } from "@/lib/mosque/exams";

/*
  "الاختبارات" للمعلّم — ترشيح طلاب حلقته (النوع من جامع الحلقة والنطاق بطول
  النوع)، ومتابعة ترشيحاتها، ودخول شاشة التقييم لجلساته كممتحن.
*/

type ExamType = { id: number; name: string; juzCount: number; maxScore: number; passMark: number };
type Nomination = {
  id: number;
  typeName: string;
  studentName: string;
  juzFrom: number;
  juzTo: number;
  status: NominationStatus;
  sessionDate?: string | null;
  note: string;
};
type ScoringSession = {
  id: number;
  typeName: string;
  sessionDate: string;
  location: string;
  status: "scheduled" | "closed";
  scheduledCount: number;
  recordedCount: number;
  committee: { kind: string; id: number; name: string }[];
};

type ExamsData = { types: ExamType[]; nominations: Nomination[]; sessions: ScoringSession[] } | null;

export default function TeacherExamsPage() {
  const { students, loading: studentsLoading } = useStudents();
  const [data, setData] = useState<{ key: string; data: ExamsData; status: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/exam-nominations")
      .then(async (res) => ({ ok: res.ok, status: res.status, body: res.ok ? await res.json() : null }))
      .then((outcome) => {
        if (!cancelled) setData({ key: "exams", data: outcome.body as ExamsData, status: outcome.status });
      })
      .catch(() => {
        if (!cancelled) setData({ key: "exams", data: null, status: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (data === null || studentsLoading) return <Empty title="جارٍ التحميل…" />;

  if (data.status === 404) {
    return (
      <Empty
        title="الاختبارات غير مفعّلة لجامع حلقتك."
        action={
          <Link href="/join-mosque" className="text-sm text-blue-700 hover:underline">
            ربط حلقتك بجامع من هنا
          </Link>
        }
      />
    );
  }
  if (!data.data) return <Empty title="تعذّر تحميل البيانات." />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-naskh text-2xl font-bold text-slate-800">الاختبارات</h1>
        <p className="text-sm text-slate-500">رشّح طلابك لاختبارات جامعك، وقيّم جلساتك كممتحن.</p>
      </header>

      <NominateCard types={data.data.types} students={students.filter((s) => s.active)} />

      <SessionsCard sessions={data.data.sessions} />

      <Card className="p-4">
        <h2 className="mb-3 font-semibold text-slate-800">ترشيحاتي</h2>
        {data.data.nominations.length === 0 ? (
          <p className="text-sm text-slate-500">لا ترشيحات بعد — ابدأ بترشيح طالب من الأعلى.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.data.nominations.map((nomination) => (
              <li key={nomination.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-sm text-slate-700">
                  <span className="font-semibold">{nomination.studentName}</span>
                  <span className="mx-1 text-slate-400">•</span>
                  {nomination.typeName} ({juzRangeLabel(nomination.juzFrom, nomination.juzTo)})
                  {nomination.note && <span className="ms-1 text-xs text-slate-400">{nomination.note}</span>}
                </span>
                <Badge tone={nomination.status === "done" ? "good" : nomination.status === "withdrawn" ? "warn" : "neutral"}>
                  {NOMINATION_STATUS_LABELS[nomination.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function NominateCard({ types, students }: { types: ExamType[]; students: { id: string; name: string }[] }) {
  const [typeId, setTypeId] = useState(String(types[0]?.id ?? ""));
  const [studentId, setStudentId] = useState("");
  const [juzFrom, setJuzFrom] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  const type = types.find((t) => String(t.id) === typeId);
  const juzCount = type?.juzCount ?? 1;
  const juzTo = Math.min(30, Number(juzFrom) + juzCount - 1);

  async function nominate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setOkMessage(null);
    const res = await fetch("/api/exam-nominations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typeId: Number(typeId), studentId, juzFrom: Number(juzFrom), juzTo, note }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "تعذّر الترشيح");
      return;
    }
    const student = students.find((s) => s.id === studentId);
    setOkMessage(`رُشّح ${student?.name ?? "الطالب"} بنجاح — تتابع الإدارة جدولته ✓`);
    setStudentId("");
    setNote("");
    setTimeout(() => window.location.reload(), 900);
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-semibold text-slate-800">ترشيح طالب</h2>
      {types.length === 0 || students.length === 0 ? (
        <p className="text-sm text-slate-500">
          {types.length === 0 ? "لا توجد أنواع اختبارات بجامعك بعد." : "لا طلاب فعّالين بحلقتك بعد."}
        </p>
      ) : (
        <form onSubmit={nominate} className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-500">
            نوع الاختبار
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.juzCount === 1 ? "جزء واحد" : `${t.juzCount} أجزاء`}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            الطالب
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
              <option value="">اختر طالباً…</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            من الجزء
            <input
              type="number"
              min={1}
              max={30}
              value={juzFrom}
              onChange={(e) => setJuzFrom(e.target.value)}
              className="tabular mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </label>
          <p className="flex items-end text-xs text-slate-500">
            النطاق: {juzRangeLabel(Number(juzFrom) || 1, juzTo)} — الدرجة {type?.maxScore ?? 100} والنجاح عند {type?.passMark ?? 60}
          </p>
          <label className="block text-xs text-slate-500 sm:col-span-2">
            ملاحظة (اختياري)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !studentId || !typeId}>
              ترشيح للاختبار
            </Button>
          </div>
        </form>
      )}
      {okMessage && <p className="text-sm text-emerald-700">{okMessage}</p>}
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </Card>
  );
}

function SessionsCard({ sessions }: { sessions: ScoringSession[] }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 font-semibold text-slate-800">جلساتي كممتحن</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-500">لم تُضَف بعد للجنة أي جلسة اختبار.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {sessions.map((session) => (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="text-sm text-slate-700">
                <Link href={`/exams/${session.id}`} className="font-semibold text-blue-700 hover:underline">
                  {session.typeName}
                </Link>
                <span className="mx-1 text-slate-400">•</span>
                <span className="tabular">{session.sessionDate}</span>
                {session.location && <span className="text-slate-400"> • {session.location}</span>}
                <span className="ms-2 text-xs text-slate-400">
                  {session.recordedCount}/{session.scheduledCount + session.recordedCount} مسجَّلة
                </span>
              </span>
              <Link
                href={`/exams/${session.id}`}
                className="rounded-xl bg-blue-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-800"
              >
                شاشة التقييم
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
