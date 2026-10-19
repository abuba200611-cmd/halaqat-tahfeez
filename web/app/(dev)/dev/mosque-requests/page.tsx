"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { RegistrationRequest } from "@/lib/mosque-registration-db";

/*
  طلبات تسجيل الجوامع: المعلّقة أولاً بأزرار موافقة (ينشئ الجامع ومديره
  بترانزاكشن واحدة، مع ربط جمعية مطابقة بالاسم أو مختارة) ورفض بسبب. المبتوت
  فيها تبقى للمراجعة.
*/

type Data = { requests: RegistrationRequest[]; pending: number; associations: { id: number; name: string }[] };

const STATUS_LABEL = { pending: "معلّق", approved: "مقبول", rejected: "مرفوض" } as const;
const STATUS_TONE = { pending: "warn", approved: "good", rejected: "neutral" } as const;
const FILTERS = [
  { key: "pending", label: "المعلّقة" },
  { key: "approved", label: "المقبولة" },
  { key: "rejected", label: "المرفوضة" },
] as const;

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function DevMosqueRequestsPage() {
  const { data, loading, status, reload } = useApi<Data>("/api/dev/mosque-requests");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("pending");

  const shown = data?.requests.filter((r) => r.status === filter) ?? [];
  const count = (key: string) => data?.requests.filter((r) => r.status === key).length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">طلبات تسجيل الجوامع</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          طلبات وردت من صفحة <span dir="ltr">/register-mosque</span>. عند الموافقة يُنشأ الجامع ومديره بنفس اسم المستخدم وكلمة المرور التي اختارها مقدّم الطلب.
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

      {loading && !data && <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>}
      {!loading && !data && (
        <Card className="p-4 text-sm text-destructive">
          {status === 401 ? "الجلسة انتهت — سجّل الدخول من جديد." : "تعذّر التحميل."}
        </Card>
      )}
      {data && shown.length === 0 && <Card className="p-4 text-sm text-muted-foreground">لا طلبات في هذه الحالة.</Card>}
      {data && shown.map((r) => <RequestCard key={r.id} request={r} associations={data.associations} onChanged={reload} />)}
    </div>
  );
}

function RequestCard({
  request: r,
  associations,
  onChanged,
}: {
  request: RegistrationRequest;
  associations: Data["associations"];
  onChanged: () => void;
}) {
  const [associationId, setAssociationId] = useState<string>("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matched = associations.filter((a) => a.name.trim().toLowerCase() === r.associationName.trim().toLowerCase());

  async function decide(path: "approve" | "reject", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/dev/mosque-requests/${r.id}/${path}`, "POST", body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      // 409 = بُتّ فيه من جلسة أخرى: حدّث القائمة
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
            {r.mosqueName} <span className="text-xs font-normal text-muted-foreground">#{r.id}</span>
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {r.city ? `${r.city} · ` : ""}
            {new Date(r.createdAt).toLocaleDateString("ar", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        <Row label="مقدّم الطلب" value={r.applicantName} />
        <Row label="الجوال" value={r.phone} ltr />
        <Row label="البريد" value={r.email} ltr />
        <Row label="اسم المستخدم" value={r.username} ltr />
        <Row label="الجمعية المذكورة" value={r.associationName || "—"} />
        {r.mosqueId !== null && <Row label="الجامع المُنشأ" value={`#${r.mosqueId}`} />}
      </dl>

      {r.status === "rejected" && r.rejectReason && (
        <p className="mt-3 rounded-md bg-muted px-3 py-2 text-sm leading-relaxed">سبب الرفض: {r.rejectReason}</p>
      )}

      {r.status === "pending" && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">
              ربط بجمعية {matched.length === 1 ? `(مطابقة بالاسم: ${matched[0].name})` : "(اختياري)"}
            </span>
            <select value={associationId} onChange={(e) => setAssociationId(e.target.value)} className={`${inputClass} mt-1`}>
              <option value="">{matched.length === 1 ? "تلقائي — المطابقة بالاسم" : "بلا جمعية"}</option>
              {associations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          {rejecting && (
            <label className="block text-sm">
              <span className="text-xs text-muted-foreground">سبب الرفض (يظهر لمقدّم الطلب)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={300}
                className={`${inputClass} mt-1 leading-relaxed`}
              />
            </label>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex flex-wrap gap-2">
            {!rejecting ? (
              <>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => decide("approve", associationId ? { associationId: Number(associationId) } : {})}
                >
                  {busy ? "لحظة…" : "موافقة وإنشاء الجامع"}
                </Button>
                <Button type="button" variant="danger" disabled={busy} onClick={() => setRejecting(true)}>
                  رفض
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => decide("reject", { reason })}>
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

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-xs leading-relaxed text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words leading-relaxed" dir={ltr ? "ltr" : undefined}>
        {value}
      </dd>
    </div>
  );
}
