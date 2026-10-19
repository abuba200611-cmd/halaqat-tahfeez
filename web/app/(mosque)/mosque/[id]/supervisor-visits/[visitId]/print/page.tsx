"use client";

import { useParams } from "next/navigation";
import { Button, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage } from "@/components/mosque/mosque-page";
import { useApi } from "@/components/mosque/use-api";
import { VisitReportDoc } from "@/components/supervisor-visits/visit-report-doc";
import type { VisitCriterion, VisitScores, VisitStatus } from "@/lib/supervisor-visits";

/* B4 — تقرير زيارة المشرف للطباعة: /mosque/[id]/supervisor-visits/[visitId]/print */

type DetailData = {
  visit: {
    id: number;
    status: VisitStatus;
    halaqahName: string;
    visitorName: string;
    scheduledFor: string;
    visitedAt: string | null;
    overallScore: number | null;
    notes: string;
    recommendations: string;
  };
  criteria: VisitCriterion[];
  scores: VisitScores;
  mosqueName: string;
};

export default function MosqueVisitPrintPage() {
  const params = useParams<{ id: string; visitId: string }>();
  const mosqueId = Number(params.id);
  const { data, status, loading } = useApi<DetailData>(
    `/api/mosques/${mosqueId}/supervisor-visits/${params.visitId}`,
  );

  return (
    <MosquePage
      mosqueId={mosqueId}
      activeHref={`/mosque/${mosqueId}/supervisor-visits`}
      title="تقرير زيارة المشرف"
    >
      <ApiState loading={loading && !data} status={status} mosqueId={mosqueId} featureName="زيارات المشرف التربوي" />
      {data && data.visit.status !== "done" && <Empty title="لا يتوفر تقرير إلا لزيارة منجزة." />}
      {data && data.visit.status === "done" && (
        <div className="space-y-3">
          <div className="print:hidden">
            <Button type="button" onClick={() => window.print()}>
              طباعة
            </Button>
          </div>
          <VisitReportDoc
            data={{
              mosqueName: data.mosqueName,
              halaqahName: data.visit.halaqahName,
              visitorName: data.visit.visitorName,
              scheduledFor: data.visit.scheduledFor,
              visitedAt: data.visit.visitedAt,
              status: data.visit.status,
              criteria: data.criteria,
              scores: data.scores,
              overallScore: data.visit.overallScore,
              notes: data.visit.notes,
              recommendations: data.visit.recommendations,
            }}
          />
        </div>
      )}
    </MosquePage>
  );
}
