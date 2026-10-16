"use client";

import { useEffect, useState } from "react";
import { useStudentSession } from "@/components/student-gate";
import { ERROR_KINDS, ERROR_LABELS, juzRangeLabel, type ErrorKind } from "@/lib/mosque/exams";

/*
  "اختباراتي" — نتائج اختبارات الحفظ المنشورة للطالب (المسوّدات لا تصل
  هنا): النوع والنطاق والدرجة والنجاح وتفصيل الأخطاء واختبارها.
*/

type ExamResult = {
  id: number;
  typeName: string;
  juzFrom: number;
  juzTo: number;
  score: number;
  maxScore: number;
  passMark: number;
  passed: boolean;
  errors: Record<ErrorKind, number>;
  sessionDate: string;
  examinerName: string;
};

export default function StudentExamsPage() {
  const student = useStudentSession();
  const studentId = student?.id ?? null;
  const [results, setResults] = useState<ExamResult[] | null>(null);

  useEffect(() => {
    if (studentId === null) return;
    let cancelled = false;
    fetch("/api/student/exams")
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data: { results?: ExamResult[] }) => {
        if (!cancelled) setResults(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  return (
    <div className="space-y-4">
      <h1 className="font-naskh text-xl font-bold text-slate-800">اختباراتي</h1>
      <p className="text-sm text-slate-500">نتائج اختبارات الحفظ التي تُعلنها لجنة الاختبار.</p>

      {results === null ? (
        <p className="text-sm text-slate-500">جارٍ التحميل…</p>
      ) : results.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-naskh text-lg font-bold text-slate-700">لا نتائج بعد</p>
          <p className="text-sm text-slate-500">حين ترشّحك حلقتك لاختبار وتُعلن نتيجته ستجدها هنا.</p>
        </div>
      ) : (
        results.map((result) => <ResultCard key={result.id} result={result} />)
      )}
    </div>
  );
}

function ResultCard({ result }: { result: ExamResult }) {
  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-naskh text-lg font-bold text-slate-800">
            {result.typeName} — {juzRangeLabel(result.juzFrom, result.juzTo)}
          </h2>
          <p className="text-xs text-slate-500">
            بتاريخ {result.sessionDate}
            {result.examinerName ? ` • الممتحن: ${result.examinerName}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-bold ${
            result.passed ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-700"
          }`}
        >
          {result.passed ? "ناجح 🎉" : "لم يُجتز"}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full ${result.passed ? "bg-emerald-500" : "bg-rose-400"}`}
            style={{ width: `${Math.min(100, Math.round((result.score / result.maxScore) * 100))}%` }}
          />
        </div>
        <span className="tabular text-sm font-bold text-slate-700">
          {result.score} من {result.maxScore}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
        {ERROR_KINDS.map((kind) => (
          <span key={kind} className="rounded-lg bg-slate-50 px-2 py-1">
            {ERROR_LABELS[kind]}: <span className="tabular font-bold">{result.errors[kind] ?? 0}</span>
          </span>
        ))}
      </div>
    </section>
  );
}
