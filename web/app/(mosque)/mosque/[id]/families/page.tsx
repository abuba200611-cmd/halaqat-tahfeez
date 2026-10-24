"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { Family } from "@/lib/mosque/db";

/** أسر الجامع: قائمة بعدد الأفراد + إنشاء أسرة جديدة */
export default function FamiliesPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/families`} title="الأسر">
      <FamiliesList mosqueId={mosqueId} />
    </MosquePage>
  );
}

function FamiliesList({ mosqueId }: { mosqueId: number }) {
  const { data, status, loading, reload } = useApi<{ families: Family[] }>(`/api/mosques/${mosqueId}/families`);
  const [name, setName] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/mosques/${mosqueId}/families`, "POST", { name, leaderName });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setLeaderName("");
    reload();
  }

  if (!data) return <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الأسر" />;

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs text-muted-foreground">
            اسم الأسرة
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              placeholder="مثال: أسرة الفاروق"
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            رئيس الأسرة (اختياري)
            <input
              value={leaderName}
              onChange={(e) => setLeaderName(e.target.value)}
              maxLength={100}
              className={`${inputClass} mt-1`}
            />
          </label>
          <Button type="submit" disabled={busy || !name.trim()}>
            إضافة أسرة
          </Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>

      {data.families.length === 0 ? (
        <Empty title="لا توجد أسر بعد — أضف أول أسرة من النموذج أعلاه." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.families.map((family) => (
            <Link key={family.id} href={`/mosque/${mosqueId}/families/${family.id}`}>
              <Card className="p-4 transition-colors duration-200 hover:border-border-strong">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{family.name}</p>
                  <Badge>{family.memberCount} فرد</Badge>
                </div>
                {family.leaderName && (
                  <p className="mt-1 text-xs text-muted-foreground">الرئيس: {family.leaderName}</p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
