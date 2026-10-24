"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { Committee } from "@/lib/mosque/db";

/** لجان الجامع: قائمة بعدد الأعضاء + إنشاء لجنة جديدة */
export default function CommitteesPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/committees`} title="اللجان">
      <CommitteesList mosqueId={mosqueId} />
    </MosquePage>
  );
}

function CommitteesList({ mosqueId }: { mosqueId: number }) {
  const { data, status, loading, reload } = useApi<{ committees: Committee[] }>(
    `/api/mosques/${mosqueId}/committees`,
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/mosques/${mosqueId}/committees`, "POST", { name, description });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setDescription("");
    reload();
  }

  if (!data) return <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="اللجان" />;

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs text-muted-foreground">
            اسم اللجنة
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              placeholder="مثال: لجنة الأنشطة"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            الوصف (اختياري)
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              className={`${inputClass} mt-1`}
            />
          </label>
          <Button type="submit" disabled={busy || !name.trim()}>
            إضافة لجنة
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>

      {data.committees.length === 0 ? (
        <Empty title="لا توجد لجان بعد — أضف أول لجنة من النموذج أعلاه." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.committees.map((committee) => (
            <Link key={committee.id} href={`/mosque/${mosqueId}/committees/${committee.id}`}>
              <Card className="p-4 transition-colors duration-200 hover:border-border-strong">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{committee.name}</p>
                  <Badge>{committee.memberCount} عضو</Badge>
                </div>
                {committee.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{committee.description}</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
