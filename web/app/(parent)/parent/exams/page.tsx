"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useParentSession } from "@/components/parent-shell";
import { ERROR_KINDS, ERROR_LABELS, juzRangeLabel, type ErrorKind } from "@/lib/mosque/exams";

/*
  نتائج اختبارات الأبناء — نفس مباخث لوحة ولي الأمر: اختيار الابن ثم
  نتائجه المنشورة حصراً (لا مسوّدات ولا نتائج أبناء غيره).
*/

type Child = { halaqahId: number; studentId: string; studentName: string; halaqahName: string };
type ExamResult = {
  id: number;
  typeName: string;
  juzFrom: number;
  juzTo: number;
  score: number;
  maxScore: number;
  passed: boolean;
  errors: Record<ErrorKind, number>;
  sessionDate: string;
  examinerName: string;
};

const keyOf = (c: { halaqahId: number; studentId: string }) => `${c.halaqahId}:${c.studentId}`;

export default function ParentExamsPage() {
  return (
    <Suspense>
      <Exams />
    </Suspense>
  );
}

function Exams() {
  const { parent } = useParentSession();
  const params = useSearchParams();
  const parentId = parent?.id ?? null;

  const [children, setChildren] = useState<Child[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [results, setResults] = useState<ExamResult[] | null>(null);

  useEffect(() => {
    if (parentId === null) return;
    let cancelled = false;
    fetch("/api/parent/children")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { children?: Child[] } | null) => {
        if (!cancelled) setChildren(data?.children ?? []);
      })
      .catch(() => {
        if (!cancelled) setChildren([]);
      });
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  const selected = picked ?? params.get("child");

  useEffect(() => {
    if (selected === null) return;
    const [halaqah, student] = selected.split(":");
    let cancelled = false;
    fetch(`/api/parent/exams?halaqah=${encodeURIComponent(halaqah)}&student=${encodeURIComponent(student)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { results?: ExamResult[] } | null) => {
        if (!cancelled) setResults(data?.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const active = children?.find((child) => keyOf(child) === selected);

  return (
    <div className="space-y-4">
      <h1 className="font-naskh text-xl font-bold text-slate-800">نتائج الاختبارات</h1>

      {children !== null && children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((child) => (
            <button
              key={keyOf(child)}
              type="button"
              onClick={() => {
                setPicked(keyOf(child));
                setResults(null);
              }}
              className={`cursor-pointer rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors duration-200 ${
                keyOf(child) === selected ? "bg-blue-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {child.studentName}
            </button>
          ))}
        </div>
      )}

      {active && (
        <p className="text-sm text-slate-500">
          نتائج {active.studentName} — حلقة {active.halaqahName}
        </p>
      )}

      {results === null ? (
        <p className="text-sm text-slate-500">{selected === null ? "اختر الابن أولاً." : "جارٍ التحميل…"}</p>
      ) : results.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="font-naskh text-lg font-bold text-slate-700">لا نتائج بعد</p>
          <p className="text-sm text-slate-500">حين تُعلن لجنة الاختبار نتيجةً ستجدها هنا.</p>
        </div>
      ) : (
        results.map((result) => (
          <section key={result.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
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
            <p className="tabular text-sm font-bold text-slate-700">
              الدرجة: {result.score} من {result.maxScore}
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-slate-600">
              {ERROR_KINDS.map((kind) => (
                <span key={kind} className="rounded-lg bg-slate-50 px-2 py-1">
                  {ERROR_LABELS[kind]}: <span className="tabular font-bold">{result.errors[kind] ?? 0}</span>
                </span>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
