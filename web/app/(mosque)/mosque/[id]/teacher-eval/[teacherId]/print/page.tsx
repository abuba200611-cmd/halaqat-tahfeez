"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage } from "@/components/mosque/mosque-page";
import { useApi } from "@/components/mosque/use-api";
import { TeacherEvalDoc } from "@/components/teacher-eval-doc";
import type { EvalScores, EvalTerm, TeacherEvalConfig } from "@/lib/teacher-eval";

/* A3 — تقرير تقييم معلّم للطباعة: /mosque/[id]/teacher-eval/[teacherId]/print?year=&term= */

type DetailData = {
  teacher: { id: number; name: string; halaqahName: string };
  period: { year: number; term: EvalTerm; key: string; from: string; to: string };
  config: TeacherEvalConfig;
  indicators: React.ComponentProps<typeof TeacherEvalDoc>["data"]["indicators"];
  evaluation: { scores: EvalScores; notes: string; evaluatedBy: string } | null;
};

const TERM_LABELS: Record<EvalTerm, string> = { year: "العام الدراسي", "1": "الفصل الأول", "2": "الفصل الثاني" };

export default function TeacherEvalPrintPage() {
  return (
    <Suspense>
      <PrintInner />
    </Suspense>
  );
}

function PrintInner() {
  const routeParams = useParams<{ id: string; teacherId: string }>();
  const mosqueId = Number(routeParams.id);
  const teacherId = Number(routeParams.teacherId);
  const search = useSearchParams();
  const qs = new URLSearchParams();
  const year = search.get("year");
  const term = search.get("term");
  if (year) qs.set("year", year);
  if (term) qs.set("term", term);
  const suffix = qs.toString() === "" ? "" : `?${qs.toString()}`;

  const { data, status, loading } = useApi<DetailData>(`/api/mosques/${mosqueId}/teacher-eval/${teacherId}${suffix}`);
  const mosqueName = useApi<{ mosque: { name: string } }>(`/api/mosques/${mosqueId}`).data?.mosque.name ?? "";

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/teacher-eval`} title="تقرير تقييم المعلّم">
      <ApiState loading={loading && !data} status={status} mosqueId={mosqueId} featureName="تقييم المعلّمين والحوافز" />
      {data && !data.evaluation && <Empty title="لم يُحفظ تقييم لهذا المعلّم في هذه الفترة بعد." />}
      {data && data.evaluation && (
        <div className="space-y-3">
          <div className="print:hidden">
            <Button type="button" onClick={() => window.print()}>
              طباعة
            </Button>
          </div>
          <TeacherEvalDoc
            data={{
              mosqueName,
              teacherName: data.teacher.name,
              halaqahName: data.teacher.halaqahName,
              periodLabel: `${TERM_LABELS[data.period.term]} ${data.period.year} هـ`,
              range: { from: data.period.from, to: data.period.to },
              config: data.config,
              scores: data.evaluation.scores,
              notes: data.evaluation.notes,
              indicators: data.indicators,
              evaluatedBy: data.evaluation.evaluatedBy || null,
            }}
          />
        </div>
      )}
    </MosquePage>
  );
}
