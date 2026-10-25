"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { DeletionRequest } from "@/lib/data-requests";

/*
  طلبات حذف البيانات: يرفعها المستخدمون من إعدادات أدوارهم («طلب حذف بياناتي»).
  المطوّر ينفّذ الحذف يدوياً ثم يضغط «تم التنفيذ»، أو يرفض بسبب إلزامي.
*/

type Data = { requests: DeletionRequest[]; pending: number };

const KIND_LABEL = {
  teacher: "معلّم",
  parent: "ولي أمر",
  student: "طالب",
  mosque_admin: "مدير جامع",
  association_admin: "مدير جمعية",
} as const;
const STATUS_LABEL = { pending: "معلّق", done: "منجز", rejected: "مرفوض" } as const;
const STATUS_TONE = { pending: "warn", done: "good", rejected: "neutral" } as const;
const FILTERS = [
  { key: "pending", label: "المعلّقة" },
  { key: "done", label: "المنجزة" },
  { key: "rejected", label: "المرفوضة" },
] as const;

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function DevDataRequestsPage() {
  const { data, loading, status, reload } = useApi<Data>("/api/dev/data-requests");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("pending");

  const shown = data?.requests.filter((r) => r.status === filter) ?? [];
  const count = (key: string) => data?.requests.filter((r) => r.status === key).length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">طلبات حذف البيانات</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          طلبات «حذف بياناتي» الواردة من إعدادات الأدوار. نفّذ الحذف أولاً ثم وسم الطلب «تم التنفيذ»؛ والرفض يلزمه سبب.
        </p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="حالة الطلب">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors duration-200 ${
              filter === f.key ? "border-primary bg-primary text-on-primary" : "border-border bg-surface hover:bg-muted"
            }`}
          >
            {f.label} <span className="tabular">({count(f.key)})</span>
          </button>
        ))}
      </div>

      <RetentionCard />

      {loading && !data && <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>}
      {!loading && !data && (
        <Card className="p-4 text-sm text-destructive">
          {status === 401 ? "الجلسة انتهت — سجّل الدخول من جديد." : "تعذّر التحميل."}
        </Card>
      )}
      {data && shown.length === 0 && <Card className="p-4 text-sm text-muted-foreground">لا طلبات في هذه الحالة.</Card>}
      {data && shown.map((r) => <RequestCard key={r.id} request={r} onChanged={reload} />)}
    </div>
  );
}

type RetentionResult = { key: string; label: string; deleted: number; error?: true };

/** تنظيف الاحتفاظ: يحذف المنتهي (رموز، عدّادات، طلبات مبتوت فيها قديمة…) عبر /api/dev/retention */
function RetentionCard() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RetentionResult[] | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    const result = await callApi<{ results: RetentionResult[] }>("/api/dev/retention", "POST");
    setBusy(false);
    setConfirming(false);
    if (!result.ok || !result.data) {
      setError(result.error);
      return;
    }
    setResults(result.data.results);
  }

  const total = results?.reduce((sum, r) => sum + r.deleted, 0) ?? 0;

  return (
    <Card className="p-4">
      <p className="text-base font-semibold">تنظيف البيانات المنتهية</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        يحذف رموز الاسترجاع والتأكيد والربط المنتهية، وعدّادات المحاولات الأقدم من أسبوع، وطلبات الحذف المبتوت فيها منذ
        ١٨٠ يوماً، وأحداث الأمان الأقدم من ١٨٠ يوماً. الطلبات المعلّقة لا تُمسّ.
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {results && (
        <div className="mt-3 rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">
          <p className="font-semibold">
            حُذف <span className="tabular">{total}</span> صفاً.
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {results
              .filter((r) => r.deleted > 0 || r.error)
              .map((r) => (
                <li key={r.key}>
                  {r.label}: {r.error ? "تعذّر" : <span className="tabular">{r.deleted}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!confirming ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            تنظيف الآن
          </Button>
        ) : (
          <>
            <Button type="button" variant="danger" disabled={busy} onClick={run}>
              {busy ? "لحظة…" : "تأكيد الحذف"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>
              تراجع
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function RequestCard({ request: r, onChanged }: { request: DeletionRequest; onChanged: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "done" | "rejected", note: string) {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/dev/data-requests/${r.id}`, "POST", { decision, note });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      if (result.status === 409) onChanged();
      return;
    }
    onChanged();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold leading-snug">
            {r.displayName || "—"} <span className="text-xs font-normal text-muted-foreground">#{r.id}</span>
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {KIND_LABEL[r.requesterKind]} · <span dir="ltr">{r.requesterRef}</span> ·{" "}
            {new Date(r.createdAt).toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
      </div>

      {r.note && <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">ملاحظة المستخدم: {r.note}</p>}
      {r.status !== "pending" && r.decisionNote && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">ملاحظة القرار: {r.decisionNote}</p>
      )}

      {r.status === "pending" && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          {rejecting && (
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">سبب الرفض</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                className={`${inputClass} mt-1 leading-relaxed`}
              />
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {!rejecting ? (
              <>
                <Button type="button" disabled={busy} onClick={() => decide("done", "")}>
                  {busy ? "لحظة…" : "تم التنفيذ"}
                </Button>
                <Button type="button" variant="danger" disabled={busy} onClick={() => setRejecting(true)}>
                  رفض
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => decide("rejected", reason)}>
                  {busy ? "لحظة…" : "تأكيد الرفض"}
                </Button>
                <Button type="button" variant="ghost" disabled={busy} onClick={() => setRejecting(false)}>
                  تراجع
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
