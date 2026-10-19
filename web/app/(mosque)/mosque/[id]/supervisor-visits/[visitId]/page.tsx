"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiState, MosquePage } from "@/components/mosque/mosque-page";
import { useApi } from "@/components/mosque/use-api";
import { VisitEditor, type VisitEditorData } from "@/components/supervisor-visits/visit-editor";
import type { VisitCriterion, VisitScores } from "@/lib/supervisor-visits";

/*
  B4 — نموذج تقييم زيارة واحدة لإدارة الجامع، مع رابط التقرير القابل
  للطباعة بعد الإنجاز. الحالة تعاد من الخادم بعد كل حفظ.
*/

type DetailData = {
  visit: VisitEditorData;
  criteria: VisitCriterion[];
  scores: VisitScores;
  mosqueName: string;
};

export default function MosqueVisitPage() {
  const params = useParams<{ id: string; visitId: string }>();
  const mosqueId = Number(params.id);
  const api = `/api/mosques/${mosqueId}/supervisor-visits/${params.visitId}`;
  const { data, status, loading, dataKey, reload } = useApi<DetailData>(api);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/supervisor-visits`} title="تقييم زيارة المشرف">
      <ApiState loading={loading && !data} status={status} mosqueId={mosqueId} featureName="زيارات المشرف التربوي" />
      {data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href={`/mosque/${mosqueId}/supervisor-visits`} className="text-sm text-accent-ink hover:underline">
              ← الزيارات
            </Link>
            {data.visit.status === "done" && (
              <a
                href={`/mosque/${mosqueId}/supervisor-visits/${params.visitId}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
              >
                تقرير للطباعة
              </a>
            )}
          </div>
          <VisitEditor
            key={dataKey}
            apiBase={api}
            visit={data.visit}
            criteria={data.criteria}
            initialScores={data.scores}
            onSaved={reload}
          />
        </div>
      )}
    </MosquePage>
  );
}
