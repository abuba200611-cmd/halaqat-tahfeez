"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Empty } from "@/components/mosque/ui";
import { useApi } from "@/components/mosque/use-api";
import { AssociationPage } from "@/components/association/association-page";
import { VisitEditor, type VisitEditorData } from "@/components/supervisor-visits/visit-editor";
import type { VisitCriterion, VisitScores } from "@/lib/supervisor-visits";

/*
  B4 — نموذج تقييم زيارة من لوحة الجمعية (الشكل نفسه الذي تراه إدارة
  الجامع). معايير الجامع ودرجاته تُعاد من مسار الجمعية بعد تحقق انتماء
  الجامع لجمعية الجلسة خادمياً.
*/

type DetailData = {
  visit: VisitEditorData;
  criteria: VisitCriterion[];
  scores: VisitScores;
  mosqueName: string;
};

export default function AssociationVisitPage() {
  const params = useParams<{ visitId: string }>();
  const api = `/api/association/visits/${params.visitId}`;
  const { data, status, loading, dataKey, reload } = useApi<DetailData>(api);

  return (
    <AssociationPage title="تقييم زيارة المشرف" activeHref="/association/visits">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/association/visits" className="text-sm text-accent-ink hover:underline">
            ← الزيارات
          </Link>
          {data?.visit.status === "done" && (
            <Link
              href={`/association/visits/${params.visitId}/print`}
              target="_blank"
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              تقرير للطباعة
            </Link>
          )}
        </div>
        {loading && <Empty title="جارٍ التحميل…" />}
        {!loading && !data && <Empty title={status === 404 ? "الزيارة غير موجودة." : "تعذّر تحميل البيانات."} />}
        {data && (
          <VisitEditor
            key={dataKey}
            apiBase={api}
            visit={data.visit}
            criteria={data.criteria}
            initialScores={data.scores}
            onSaved={reload}
          />
        )}
      </div>
    </AssociationPage>
  );
}
