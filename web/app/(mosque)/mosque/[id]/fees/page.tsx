"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty, Stat } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import {
  FEE_PERIODS,
  FEE_STATUSES,
  METHOD_LABELS,
  PAYMENT_METHODS,
  PERIOD_LABELS,
  STATUS_LABELS,
  canWaive,
  centsToDecimal,
  defaultPeriodLabel,
  formatMoney,
  type FeePeriod,
  type FeeStatus,
  type FeeTotals,
  type PaymentMethod,
} from "@/lib/fees";

/*
  الرسوم والاشتراكات لمدير الجامع (سجل يدوي بلا بوابة دفع): خطط الرسوم،
  توليد المستحقات لفترة عبر حلقات مختارة (متكرر بلا تكرار)، قائمة بمرشّحات
  وإجماليات، تسجيل دفعة، إعفاء، تصدير CSV، وإيصال للطباعة.
*/

type Plan = { id: number; name: string; amountCents: number; period: FeePeriod; active: boolean };
type Fee = {
  id: number;
  halaqahId: number;
  halaqahName: string;
  studentName: string;
  planName: string;
  periodLabel: string;
  amountDueCents: number;
  amountPaidCents: number;
  status: FeeStatus;
  dueDate: string | null;
};
type FeesData = { plans: Plan[]; fees: Fee[]; totals: FeeTotals };
type Payment = { id: number; amountCents: number; paidAt: string; method: PaymentMethod; receiptNo: string; note: string };
type Halaqah = { id: number; halaqahName: string };

const STATUS_TONE: Record<FeeStatus, "neutral" | "good" | "warn"> = {
  due: "warn",
  partial: "warn",
  paid: "good",
  waived: "neutral",
};

export default function MosqueFeesPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const [halaqah, setHalaqah] = useState("");
  const [status, setStatus] = useState("");
  const [period, setPeriod] = useState("");

  const query = new URLSearchParams();
  if (halaqah) query.set("halaqah", halaqah);
  if (status) query.set("status", status);
  if (period.trim()) query.set("period", period.trim());
  const qs = query.toString();
  const base = `/api/mosques/${mosqueId}/fees`;

  const { data, status: httpStatus, loading, reload } = useApi<FeesData>(`${base}${qs ? `?${qs}` : ""}`);
  const mosque = useApi<{ halaqahs: Halaqah[] }>(`/api/mosques/${mosqueId}`).data;
  const halaqahs = mosque?.halaqahs ?? [];

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/fees`} title="الرسوم والاشتراكات">
      {!data && <ApiState loading={loading} status={httpStatus} mosqueId={mosqueId} featureName="الرسوم والاشتراكات" />}
      {data && (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            سجل يدوي للرسوم والدفعات — لا يوجد دفع إلكتروني. تُسجَّل الدفعة بعد استلامها فعلياً.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="إجمالي المستحق" value={formatMoney(data.totals.dueCents)} hint="دون المعفى" />
            <Stat label="المحصَّل" value={formatMoney(data.totals.collectedCents)} />
            <Stat label="المتبقي" value={formatMoney(data.totals.outstandingCents)} tone="primary" />
          </div>

          <PlansCard base={base} plans={data.plans} onChanged={reload} />
          <GenerateCard base={base} plans={data.plans} halaqahs={halaqahs} onGenerated={reload} />

          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold">المستحقات ({data.fees.length})</h2>
            <Card className="grid gap-3 p-4 sm:grid-cols-4">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">الحلقة</span>
                <select value={halaqah} onChange={(e) => setHalaqah(e.target.value)} className={inputClass}>
                  <option value="">كل الحلقات</option>
                  {halaqahs.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.halaqahName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">الحالة</span>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass}>
                  <option value="">كل الحالات</option>
                  {FEE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">الفترة (مثل 2026-10)</span>
                <input
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  maxLength={20}
                  dir="ltr"
                  className={inputClass}
                />
              </label>
              <div className="flex items-end">
                <a
                  href={`${base}/export${qs ? `?${qs}` : ""}`}
                  className="w-full rounded-full border border-border bg-surface px-4 py-1.5 text-center text-sm font-medium hover:bg-muted"
                >
                  تصدير CSV
                </a>
              </div>
            </Card>

            {data.fees.length === 0 ? (
              <Empty title="لا مستحقات بهذه المرشّحات — ولّد مستحقات فترة من الأعلى." />
            ) : (
              data.fees.map((fee) => <FeeCard key={fee.id} base={base} mosqueId={mosqueId} fee={fee} onChanged={reload} />)
            )}
          </section>
        </div>
      )}
    </MosquePage>
  );
}

function PlansCard({ base, plans, onChanged }: { base: string; plans: Plan[]; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<FeePeriod>("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await callApi(`${base}/plans`, "POST", { name, amount, period });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setName("");
    setAmount("");
    onChanged();
  }

  async function toggle(plan: Plan) {
    const res = await callApi(`${base}/plans/${plan.id}`, "PATCH", { active: !plan.active });
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-bold">خطط الرسوم</h2>
      <form onSubmit={create} className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_9rem_auto]">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">اسم الخطة</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">المبلغ</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            inputMode="decimal"
            dir="ltr"
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">الدورية</span>
          <select value={period} onChange={(e) => setPeriod(e.target.value as FeePeriod)} className={inputClass}>
            {FEE_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? "لحظة…" : "إضافة"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {plans.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا خطط بعد.</p>
      ) : (
        <ul className="divide-y divide-border">
          {plans.map((plan) => (
            <li key={plan.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-semibold">{plan.name}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="tabular text-muted-foreground">{formatMoney(plan.amountCents)}</span>
                <Badge>{PERIOD_LABELS[plan.period]}</Badge>
                <Badge tone={plan.active ? "good" : "neutral"}>{plan.active ? "فعّالة" : "معطّلة"}</Badge>
                <button
                  type="button"
                  onClick={() => toggle(plan)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-xs text-accent-ink hover:bg-muted"
                >
                  {plan.active ? "تعطيل" : "تفعيل"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GenerateCard({
  base,
  plans,
  halaqahs,
  onGenerated,
}: {
  base: string;
  plans: Plan[];
  halaqahs: Halaqah[];
  onGenerated: () => void;
}) {
  const active = plans.filter((p) => p.active);
  const [planId, setPlanId] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function selectPlan(id: string) {
    setPlanId(id);
    const plan = plans.find((p) => String(p.id) === id);
    if (plan) setPeriodLabel(defaultPeriodLabel(plan.period, new Date().toISOString().slice(0, 10)));
  }

  function toggleHalaqah(id: number) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const res = await callApi<{ created: number; skipped: number }>(base, "POST", {
      planId: Number(planId),
      periodLabel,
      halaqahIds: picked,
      dueDate: dueDate || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessage(`أُنشئ ${res.data?.created ?? 0} مستحق، وتُخطّي ${res.data?.skipped ?? 0} موجود مسبقاً.`);
    onGenerated();
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-bold">توليد مستحقات فترة</h2>
      <p className="text-xs text-muted-foreground">
        يُنشئ مستحقاً لكل طالب فعّال بالحلقات المختارة. إعادة التوليد لنفس الفترة آمنة ولا تكرّر شيئاً.
      </p>
      <form onSubmit={generate} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">الخطة</span>
            <select value={planId} onChange={(e) => selectPlan(e.target.value)} required className={inputClass}>
              <option value="">اختر خطة</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatMoney(p.amountCents)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">الفترة (شهري 2026-10 · فصلي 2026-T1 · سنوي 2026 · once)</span>
            <input
              value={periodLabel}
              onChange={(e) => setPeriodLabel(e.target.value)}
              required
              maxLength={20}
              dir="ltr"
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">تاريخ الاستحقاق (اختياري)</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
          </label>
        </div>
        <fieldset>
          <legend className="mb-1 text-xs text-muted-foreground">الحلقات</legend>
          <div className="flex flex-wrap gap-2">
            {halaqahs.map((h) => (
              <label
                key={h.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${
                  picked.includes(h.id) ? "border-primary bg-primary/10" : "border-border bg-surface"
                }`}
              >
                <input type="checkbox" checked={picked.includes(h.id)} onChange={() => toggleHalaqah(h.id)} />
                {h.halaqahName}
              </label>
            ))}
            {halaqahs.length > 1 && (
              <button
                type="button"
                className="cursor-pointer rounded-lg px-2 py-1 text-xs text-accent-ink hover:bg-muted"
                onClick={() => setPicked(picked.length === halaqahs.length ? [] : halaqahs.map((h) => h.id))}
              >
                {picked.length === halaqahs.length ? "إلغاء الكل" : "تحديد الكل"}
              </button>
            )}
          </div>
        </fieldset>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {message && <p className="text-sm text-success">{message}</p>}
        <Button type="submit" disabled={busy || picked.length === 0 || !planId}>
          {busy ? "لحظة…" : "توليد المستحقات"}
        </Button>
      </form>
    </Card>
  );
}

function FeeCard({ base, mosqueId, fee, onChanged }: { base: string; mosqueId: number; fee: Fee; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const remaining = fee.status === "waived" ? 0 : Math.max(0, fee.amountDueCents - fee.amountPaidCents);

  return (
    <Card className="p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 text-right"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block font-semibold">{fee.studentName}</span>
          <span className="block text-xs text-muted-foreground">
            {fee.halaqahName} · {fee.planName} · <span className="tabular">{fee.periodLabel}</span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular text-sm text-muted-foreground">
            {centsToDecimal(fee.amountPaidCents)} / {centsToDecimal(fee.amountDueCents)}
          </span>
          <Badge tone={STATUS_TONE[fee.status]}>{STATUS_LABELS[fee.status]}</Badge>
        </span>
      </button>
      {open && <FeeDetail base={base} mosqueId={mosqueId} fee={fee} remaining={remaining} onChanged={onChanged} />}
    </Card>
  );
}

function FeeDetail({
  base,
  mosqueId,
  fee,
  remaining,
  onChanged,
}: {
  base: string;
  mosqueId: number;
  fee: Fee;
  remaining: number;
  onChanged: () => void;
}) {
  const detail = useApi<{ payments: Payment[] }>(`${base}/${fee.id}`);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await callApi(`${base}/${fee.id}/payments`, "POST", { amount, method, note });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAmount("");
    setNote("");
    detail.reload();
    onChanged();
  }

  async function waive() {
    if (!window.confirm("إعفاء هذا المستحق؟ لن يقبل دفعات بعد ذلك.")) return;
    setBusy(true);
    setError(null);
    const res = await callApi(`${base}/${fee.id}/waive`, "POST");
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onChanged();
  }

  const payments = detail.data?.payments ?? [];
  const canPay = fee.status === "due" || fee.status === "partial";

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">
        المتبقي: <span className="tabular font-semibold text-foreground">{formatMoney(remaining)}</span>
        {fee.dueDate ? ` · الاستحقاق ${fee.dueDate}` : ""}
      </p>

      {payments.length > 0 && (
        <ul className="space-y-1 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="tabular">
                {formatMoney(p.amountCents)} · {METHOD_LABELS[p.method]} · {p.paidAt.slice(0, 10)}
              </span>
              <Link
                href={`/mosque/${mosqueId}/fees/${fee.id}/receipt/${p.id}`}
                className="rounded-lg border border-border px-2 py-1 text-xs font-semibold hover:bg-muted"
              >
                إيصال {p.receiptNo}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canPay && (
        <form onSubmit={pay} className="grid items-end gap-2 sm:grid-cols-[8rem_8rem_1fr_auto]">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">مبلغ الدفعة</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              inputMode="decimal"
              dir="ltr"
              placeholder={centsToDecimal(remaining)}
              className={inputClass}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">الطريقة</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={inputClass}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">ملاحظة</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className={inputClass} />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "لحظة…" : "تسجيل الدفعة"}
          </Button>
        </form>
      )}

      {canWaive(fee.status) && (
        <Button variant="danger" type="button" disabled={busy} onClick={waive}>
          إعفاء
        </Button>
      )}
      {fee.status === "waived" && <p className="text-sm text-muted-foreground">معفى — لا يقبل دفعات.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
