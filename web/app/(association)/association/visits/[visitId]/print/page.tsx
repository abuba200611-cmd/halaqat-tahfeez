"use client";

import { useParams } from "next/navigation";
import { Button, Empty } from "@/components/mosque/ui";
import { useApi } from "@/components/mosque/use-api";
import { AssociationPage } from "@/components/association/association-page";
import { VisitReportDoc } from "@/components/supervisor-visits/visit-report-doc";
import type { VisitCriterion, VisitScores, VisitStatus } from "@/lib/supervisor-visits";

/* B4 — تقرير زيارة مشرف للطباعة من لوحة الجمعية: /association/visits/[visitId]/print */

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

export default function AssociationVisitPrintPage() {
  const params = useParams<{ visitId: string }>();
  const { data, status, loading } = useApi<DetailData>(`/api/association/visits/${params.visitId}`);

  return (
    <AssociationPage title="تقرير زيارة المشرف" activeHref="/association/visits">
      {loading && <Empty title="جارٍ التحميل…" />}
      {!loading && !data && <Empty title={status === 404 ? "الزيارة غير موجودة." : "تعذّر تحميل البيانات."} />}
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
    </AssociationPage>
  );
}
