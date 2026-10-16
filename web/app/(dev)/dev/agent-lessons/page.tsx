"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { callApi, useApi } from "@/components/mosque/use-api";

/*
  دروس الإيجنت في لوحة المطوّر: ما يقترحه مساعدو الجوامع من دروس عامة
  (مجهّلة بالمنظّف قبل الحفظ). الموافقة تُشارك الدرس بسياق كل الجوامع،
  والرفض يبقيه محجوباً. الحسم ذرّي من pending فقط.
*/

type Lesson = {
  id: number;
  content: string;
  fromMosqueName: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

const STATUS: Record<Lesson["status"], { label: string; tone: "warn" | "good" | "neutral" }> = {
  pending: { label: "بانتظار المراجعة", tone: "warn" },
  approved: { label: "معتمد — يُشارك مع كل الجوامع", tone: "good" },
  rejected: { label: "مرفوض", tone: "neutral" },
};

export default function DevAgentLessonsPage() {
  const { data, loading, reload } = useApi<{ lessons: Lesson[] }>("/api/dev/agent-lessons");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(lessonId: number, action: "approve" | "reject") {
    setBusyId(lessonId);
    setError(null);
    try {
      const result = await callApi(`/api/dev/agent-lessons/${lessonId}`, "POST", { action });
      if (!result.ok) setError(result.error);
      else reload();
    } finally {
      setBusyId(null);
    }
  }

  const lessons = data?.lessons ?? null;
  const pending = lessons?.filter((lesson) => lesson.status === "pending") ?? [];
  const decided = lessons?.filter((lesson) => lesson.status !== "pending") ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-naskh text-2xl font-bold">دروس الإيجنت</h1>
        <p className="text-sm text-muted-foreground">
          دروس عامة يقترحها مساعدو الجوامع (مجهّلة قبل الحفظ). المعتمد منها يُحقن بسياق كل الجوامع — حدّ ٥٠ درساً.
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && !lessons && <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>}

      {lessons !== null && pending.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">لا دروس بانتظار المراجعة.</Card>
      )}

      {pending.map((lesson) => (
        <Card key={lesson.id} className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm leading-6">{lesson.content}</p>
            <Badge tone={STATUS.pending.tone}>{STATUS.pending.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">من جامع: {lesson.fromMosqueName}</p>
            <div className="flex gap-2">
              <Button onClick={() => decide(lesson.id, "approve")} disabled={busyId === lesson.id}>
                اعتماد
              </Button>
              <Button variant="ghost" onClick={() => decide(lesson.id, "reject")} disabled={busyId === lesson.id}>
                رفض
              </Button>
            </div>
          </div>
        </Card>
      ))}

      {decided.length > 0 && (
        <div>
          <h2 className="mb-3 font-naskh text-lg font-bold">محسومة ({decided.length})</h2>
          <ul className="space-y-2">
            {decided.map((lesson) => (
              <li key={lesson.id}>
                <Card className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="text-sm leading-6">{lesson.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">من جامع: {lesson.fromMosqueName}</p>
                  </div>
                  <Badge tone={STATUS[lesson.status].tone}>{STATUS[lesson.status].label}</Badge>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
