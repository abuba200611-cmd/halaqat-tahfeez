"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Empty } from "@/components/ui";
import {
  ERROR_KINDS,
  ERROR_LABELS,
  NOMINATION_STATUS_LABELS,
  juzRangeLabel,
  scoreExam,
  type DeductionRules,
  type ErrorCounts,
  type ErrorKind,
} from "@/lib/mosque/exams";

/*
  شاشة تقييم الممتحن — أزرار عدّ أخطاء كبيرة تصلح للجوال (لمسة واحدة لكل
  وقعة)، والدرجة تُحسب لحظياً بنفس منطق الخادم (scoreExam)، والحفظ مسوّدة
  أو حفظ ونشر (يشعِر الطالب وولي أمره والمعلّم المرشِّح).
*/

type SessionInfo = {
  id: number;
  typeName: string;
  sessionDate: string;
  location: string;
  status: "scheduled" | "closed";
  committee: { kind: string; id: number; name: string }[];
};

type ScoringRow = {
  nomination: {
    id: number;
    studentName: string;
    juzFrom: number;
    juzTo: number;
    halaqahName: string;
    note: string;
    status: string;
  };
  result: {
    id: number;
    score: number;
    maxScore: number;
    passMark: number;
    passed: boolean;
    errors: Record<ErrorKind, number>;
    notes: string;
    publishedAt: string | null;
  } | null;
};

type SessionData = {
  session: SessionInfo;
  rules: { maxScore: number; passMark: number; deductions: DeductionRules };
  maxErrorCountPerKind: number;
  rows: ScoringRow[];
};

const zeroErrors = (): ErrorCounts => ({ jali: 0, khafi: 0, taraddud: 0, nisyan: 0 });

export default function ScoringPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [data, setData] = useState<SessionData | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [openNomination, setOpenNomination] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    params.then(({ sessionId }) =>
      fetch(`/api/exam-sessions/${encodeURIComponent(sessionId)}`)
        .then(async (res) => ({ ok: res.ok, status: res.status, body: res.ok ? await res.json() : null }))
        .then((outcome) => {
          if (cancelled) return;
          setStatus(outcome.status);
          if (outcome.ok) setData(outcome.body as SessionData);
        })
        .catch(() => {
          if (!cancelled) setStatus(0);
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (data === null) {
    if (status === 404) return <Empty title="الجلسة غير موجودة أو لست بلجنتها." />;
    if (status !== null) return <Empty title="تعذّر تحميل الجلسة." />;
    return <Empty title="جارٍ التحميل…" />;
  }

  const { session, rows } = data;
  const remaining = rows.filter((row) => !row.result).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">{session.typeName}</h1>
          <p className="text-sm text-stone-500">
            <span className="tabular">{session.sessionDate}</span>
            {session.location && ` • ${session.location}`}
            {session.committee.length > 0 && ` • اللجنة: ${session.committee.map((m) => m.name).join("، ")}`}
          </p>
        </div>
        <Link href="/exams" className="text-sm text-accent-ink hover:underline">
          عودة للاختبارات
        </Link>
      </header>

      <p className="text-sm text-stone-500">
        {rows.length === 0
          ? "لا ترشيحات مجدولة بهذه الجلسة بعد."
          : `بقية ${remaining} من ${rows.length} طالباً بلا نتيجة مسجَّلة.`}
      </p>

      <div className="space-y-3">
        {rows.map((row) => (
          <StudentScoringCard
            key={row.nomination.id}
            row={row}
            rules={data.rules}
            maxPerKind={data.maxErrorCountPerKind}
            open={openNomination === row.nomination.id}
            onToggle={() => setOpenNomination(openNomination === row.nomination.id ? null : row.nomination.id)}
          />
        ))}
      </div>
    </div>
  );
}

function StudentScoringCard({
  row,
  rules,
  maxPerKind,
  open,
  onToggle,
}: {
  row: ScoringRow;
  rules: { maxScore: number; passMark: number; deductions: DeductionRules };
  maxPerKind: number;
  open: boolean;
  onToggle: () => void;
}) {
  const { nomination, result } = row;
  // الحالة تبدأ من النتيجة المسجَّلة (تعديل مسوّدة) أو من صفر
  const [counts, setCounts] = useState<ErrorCounts>(result?.errors ? { ...zeroErrors(), ...result.errors } : zeroErrors());
  const [notes, setNotes] = useState(result?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // لقطة قواعد النوع المسجَّلة مع النتيجة تسبق قواعد النوع الحالية عند التعديل
  const maxScore = result?.maxScore ?? rules.maxScore;
  const passMark = result?.passMark ?? rules.passMark;
  const preview = scoreExam({ maxScore, passMark, deductions: rules.deductions }, counts);

  const bump = (kind: ErrorKind, delta: number) => {
    setSavedMessage(null);
    setCounts((current) => ({
      ...current,
      [kind]: Math.min(maxPerKind, Math.max(0, current[kind] + delta)),
    }));
  };

  async function save(publish: boolean) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/exam-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nominationId: nomination.id, errors: counts, notes, publish }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "تعذّر الحفظ");
      return;
    }
    setSavedMessage(publish ? "حُفظت ونُشرت — وصل الطالبَ ووليَ أمره إشعار ✓" : "حُفظت كمسوّدة ✓");
    setTimeout(() => window.location.reload(), 1000);
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 p-4 text-start"
      >
        <span>
          <span className="font-naskh text-lg font-bold text-stone-800">{nomination.studentName}</span>
          <span className="ms-2 text-sm text-stone-500">
            {juzRangeLabel(nomination.juzFrom, nomination.juzTo)} • حلقة {nomination.halaqahName}
          </span>
        </span>
        {result ? (
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              result.publishedAt
                ? result.passed
                  ? "bg-success-soft text-success"
                  : "bg-destructive-soft text-destructive"
                : "bg-stone-100 text-stone-600"
            }`}
          >
            {result.publishedAt ? (result.passed ? "ناجح — منشورة" : "لم يُجتز — منشورة") : "مسوّدة"}{" "}
            <span className="tabular">
              {result.score}/{result.maxScore}
            </span>
          </span>
        ) : (
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
            {NOMINATION_STATUS_LABELS[nomination.status as keyof typeof NOMINATION_STATUS_LABELS] ?? nomination.status}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-4 border-t border-stone-100 p-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ERROR_KINDS.map((kind) => (
              <div key={kind} className="space-y-2 rounded-xl bg-stone-50 p-3 text-center">
                <p className="text-xs font-semibold text-stone-600">
                  {ERROR_LABELS[kind]} <span className="text-stone-400">(−{rules.deductions[kind]})</span>
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => bump(kind, -1)}
                    disabled={counts[kind] === 0}
                    className="h-12 w-12 cursor-pointer rounded-full border border-stone-300 bg-white text-xl font-bold text-stone-600 disabled:opacity-40"
                    aria-label={`إنقاص ${ERROR_LABELS[kind]}`}
                  >
                    −
                  </button>
                  <span className="tabular w-10 text-2xl font-bold text-stone-800">{counts[kind]}</span>
                  <button
                    type="button"
                    onClick={() => bump(kind, 1)}
                    disabled={counts[kind] >= maxPerKind}
                    className="h-12 w-12 cursor-pointer rounded-full bg-primary text-xl font-bold text-white disabled:opacity-40"
                    aria-label={`زيادة ${ERROR_LABELS[kind]}`}
                  >
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-3">
            <p className="text-sm text-stone-600">
              الدرجة بعد الخصومات:{" "}
              <span className={`tabular text-xl font-bold ${preview.passed ? "text-success" : "text-destructive"}`}>
                {preview.score}
              </span>{" "}
              من {maxScore}
              <span className="ms-2 text-xs text-stone-400">(النجاح عند {passMark})</span>
            </p>
            <p className={`text-sm font-bold ${preview.passed ? "text-success" : "text-destructive"}`}>
              {preview.passed ? "ناجح" : "لم يُجتز"}
            </p>
          </div>


          <label className="block text-xs text-stone-500">
            ملاحظات الممتحن (اختياري)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800"
            />
          </label>

          {result?.publishedAt ? (
            <p className="text-sm text-stone-500">النتيجة منشورة — التعديل يتطلب سحب النشر من إدارة الجامع.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => save(false)}
                disabled={busy}
                className="cursor-pointer rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                حفظ كمسوّدة
              </button>
              <button
                type="button"
                onClick={() => save(true)}
                disabled={busy}
                className="cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:opacity-50"
              >
                حفظ ونشر النتيجة
              </button>
            </div>
          )}

          {savedMessage && <p className="text-sm text-success">{savedMessage}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
