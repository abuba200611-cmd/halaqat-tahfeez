"use client";

import { useParams } from "next/navigation";
import { ApiState, MosquePage } from "@/components/mosque/mosque-page";
import { useApi } from "@/components/mosque/use-api";
import { ImportPanel } from "@/components/enrollment/import-panel";

/** استيراد طلاب الجامع من Excel/CSV — لمدير الجامع (المعلّم يستورد من صفحة طلابه) */
export default function MosqueImportPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  // GET يتحقق من الميزة: 404 = معطّلة لهذا الجامع
  const { data, status, loading } = useApi<{ ok: true }>(`/api/mosques/${mosqueId}/import`);
  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/import`} title="استيراد الطلاب">
      {!data ? (
        <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="استيراد الطلاب" />
      ) : (
        <ImportPanel
          endpoint={`/api/mosques/${mosqueId}/import`}
          templateUrl={`/api/mosques/${mosqueId}/import/template`}
          showHalaqah
        />
      )}
    </MosquePage>
  );
}
