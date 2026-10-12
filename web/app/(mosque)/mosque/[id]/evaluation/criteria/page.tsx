"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { Criterion } from "@/lib/mosque/db";

/** معايير التقييم الأسبوعي: كل جامع يحدد معاييره ودرجتها العظمى، مع زر لاقتراح الأساسيات */
export default function CriteriaPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/evaluation`} title="معايير التقييم">
      <Criteria mosqueId={mosqueId} />
    </MosquePage>
  );
}

function Criteria({ mosqueId }: { mosqueId: number }) {
  const base = `/api/mosques/${mosqueId}/evaluation/criteria`;
  const { data, status, loading, reload } = useApi<{ criteria: Criterion[] }>(base);
  const [name, setName] = useState("");
  const [maxScore, setMaxScore] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await callApi(base, "POST", { name, maxScore: Number(maxScore) });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    reload();
  }

  async function seed() {
    setBusy(true);
    setError(null);
    const result = await callApi(`${base}/suggested`, "POST");
    setBusy(false);
    if (!result.ok) setError(result.error);
    reload();
  }

  if (!data) return <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="التقييم الأسبوعي" />;

  return (
    <div className="space-y-5">
      <Link href={`/mosque/${mosqueId}/evaluation`} className="text-sm text-primary hover:underline">
        ← العودة للتقييم
      </Link>

      <Card className="space-y-3 p-4">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <label className="block text-xs text-muted-foreground">
            اسم المعيار
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block text-xs text-muted-foreground">
            الدرجة العظمى
            <input
              type="number"
              min={1}
              max={100}
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              className={`${inputClass} tabular mt-1`}
            />
          </label>
          <Button type="submit" disabled={busy || !name.trim()}>
            إضافة معيار
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <Button variant="ghost" onClick={seed} disabled={busy}>
            اقتراح المعايير الأساسية
          </Button>
          <span className="text-xs text-muted-foreground">
            الحضور، الحفظ، المراجعة، البرنامج النوعي، الاجتماع الأسري — تُضاف الناقصة فقط.
          </span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {data.criteria.length === 0 ? (
        <Empty title="لا معايير بعد." />
      ) : (
        <div className="space-y-2">
          {data.criteria.map((criterion) => (
            <CriterionRow key={`${criterion.id}:${criterion.name}:${criterion.maxScore}:${criterion.active}`} base={base} criterion={criterion} onChange={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

function CriterionRow({ base, criterion, onChange }: { base: string; criterion: Criterion; onChange: () => void }) {
  const [name, setName] = useState(criterion.name);
  const [maxScore, setMaxScore] = useState(String(criterion.maxScore));
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const result = await callApi(`${base}/${criterion.id}`, "PATCH", body);
    if (!result.ok) setError(result.error);
    else onChange();
  }

  async function remove() {
    if (!window.confirm(`حذف معيار «${criterion.name}» سيحذف كل درجاته. الأفضل تعطيله. متابعة؟`)) return;
    const result = await callApi(`${base}/${criterion.id}`, "DELETE");
    if (!result.ok) setError(result.error);
    else onChange();
  }

  const dirty = name.trim() !== criterion.name || Number(maxScore) !== criterion.maxScore;

  return (
    <Card className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          aria-label="اسم المعيار"
          className={`${inputClass} min-w-40 flex-1`}
        />
        <input
          type="number"
          min={1}
          max={100}
          value={maxScore}
          onChange={(e) => setMaxScore(e.target.value)}
          aria-label="الدرجة العظمى"
          className={`${inputClass} tabular w-24`}
        />
        <Button onClick={() => patch({ name, maxScore: Number(maxScore) })} disabled={!dirty}>
          حفظ
        </Button>
        <Button variant="ghost" onClick={() => patch({ active: !criterion.active })}>
          {criterion.active ? "تعطيل" : "تفعيل"}
        </Button>
        <Button variant="danger" onClick={remove}>
          حذف
        </Button>
        {!criterion.active && <Badge tone="warn">معطّل</Badge>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
