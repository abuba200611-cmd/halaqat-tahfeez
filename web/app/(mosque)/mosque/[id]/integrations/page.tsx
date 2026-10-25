"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";

/*
  التكاملات (ميزة "integrations" — مغلقة افتراضياً، المسار يعرض «غير مفعّلة»
  حتى تُفعَّل من الإعدادات): مفاتيح API (يظهر المفتاح مرة واحدة)، نقاط ويب
  هوكس موقَّعة، تصدير CSV، وبطاقات الموصّلات (غير منفَّذة بعد).
*/

type Key = {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};
type Endpoint = { id: number; url: string; events: string[]; active: boolean; pending: number; failed: number };
type Connector = { key: string; nameAr: string; nameEn: string; descriptionAr: string; statusAr: string };
type Overview = {
  keys: Key[];
  endpoints: Endpoint[];
  scopes: { key: string; label: string }[];
  events: string[];
  connectors: Connector[];
};

const EXPORTS = [
  { kind: "students", label: "تصدير الطلاب" },
  { kind: "attendance", label: "تصدير الحضور" },
  { kind: "progress", label: "تصدير التقدّم" },
];

export default function MosqueIntegrationsPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const base = `/api/mosques/${mosqueId}/integrations`;
  const { data, status, loading, reload } = useApi<Overview>(base);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/integrations`} title="التكاملات وواجهة البرمجة">
      {!data && <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="التكاملات وواجهة البرمجة" />}
      {data && (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            واجهة قراءة فقط مقيّدة بجامعك. لا يظهر أي مفتاح أو سرّ مرة ثانية بعد إنشائه — احفظه فوراً.
          </p>
          <KeysCard base={base} data={data} onChanged={reload} />
          <WebhooksCard base={base} data={data} onChanged={reload} />
          <Card className="space-y-3 p-4">
            <h2 className="font-display text-lg font-bold">تصدير CSV</h2>
            <div className="flex flex-wrap gap-2">
              {EXPORTS.map((e) => (
                <a
                  key={e.kind}
                  href={`${base}/export/${e.kind}`}
                  className="rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  {e.label}
                </a>
              ))}
            </div>
          </Card>
          <section className="space-y-3">
            <h2 className="font-display text-lg font-bold">الموصّلات</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {data.connectors.map((c) => (
                <Card key={c.key} className="space-y-2 p-4">
                  <h3 className="font-semibold">
                    {c.nameAr} <span className="text-xs text-muted-foreground" dir="ltr">{c.nameEn}</span>
                  </h3>
                  <p className="text-xs text-muted-foreground">{c.descriptionAr}</p>
                  <Badge tone="warn">{c.statusAr}</Badge>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </MosquePage>
  );
}

function KeysCard({ base, data, onChanged }: { base: string; data: Overview; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await callApi<{ plaintext: string }>(`${base}/keys`, "POST", { name, scopes: picked });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setShown(res.data?.plaintext ?? null);
    setName("");
    setPicked([]);
    onChanged();
  }

  async function revoke(key: Key) {
    if (!window.confirm(`سحب المفتاح «${key.name}»؟ سيتوقف فوراً ولا يمكن التراجع.`)) return;
    const res = await callApi(`${base}/keys/${key.id}`, "DELETE");
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  const label = (scope: string) => data.scopes.find((s) => s.key === scope)?.label ?? scope;

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-bold">مفاتيح API</h2>
      <form onSubmit={create} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">اسم المفتاح</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} className={inputClass} />
        </label>
        <fieldset>
          <legend className="mb-1 text-xs text-muted-foreground">النطاقات (قراءة فقط)</legend>
          <div className="flex flex-wrap gap-2">
            {data.scopes.map((s) => (
              <label
                key={s.key}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${
                  picked.includes(s.key) ? "border-primary bg-primary/10" : "border-border bg-surface"
                }`}
              >
                <input
                  type="checkbox"
                  checked={picked.includes(s.key)}
                  onChange={() => setPicked((p) => (p.includes(s.key) ? p.filter((x) => x !== s.key) : [...p, s.key]))}
                />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy || picked.length === 0}>
          {busy ? "لحظة…" : "إنشاء مفتاح"}
        </Button>
      </form>

      {shown && (
        <div role="status" className="space-y-2 rounded-xl border border-border bg-muted p-3">
          <p className="text-sm font-semibold">انسخ المفتاح الآن — لن يُعرض مرة أخرى:</p>
          <code className="block break-all rounded-lg bg-surface p-2 text-xs" dir="ltr">
            {shown}
          </code>
          <div className="flex gap-2">
            <Button type="button" onClick={() => navigator.clipboard?.writeText(shown).catch(() => undefined)}>
              نسخ
            </Button>
            <Button type="button" variant="ghost" onClick={() => setShown(null)}>
              تم، إخفاء
            </Button>
          </div>
        </div>
      )}

      {data.keys.length === 0 ? (
        <Empty title="لا مفاتيح بعد." />
      ) : (
        <ul className="divide-y divide-border">
          {data.keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold">{key.name}</span>
                <span className="block text-xs text-muted-foreground">
                  <span dir="ltr" className="tabular">mos_{key.prefix}_…</span> · {key.scopes.map(label).join("، ")}
                  {key.lastUsedAt ? ` · آخر استخدام ${key.lastUsedAt.slice(0, 10)}` : " · لم يُستخدم"}
                </span>
              </span>
              {key.revokedAt ? (
                <Badge tone="error">مسحوب</Badge>
              ) : (
                <button
                  type="button"
                  onClick={() => revoke(key)}
                  className="cursor-pointer rounded-lg px-2 py-1 text-xs text-destructive hover:bg-muted"
                >
                  سحب
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function WebhooksCard({ base, data, onChanged }: { base: string; data: Overview; onChanged: () => void }) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await callApi<{ secret: string }>(`${base}/webhooks`, "POST", { url, events });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSecret(res.data?.secret ?? null);
    setUrl("");
    setEvents([]);
    onChanged();
  }

  async function toggle(ep: Endpoint) {
    const res = await callApi(`${base}/webhooks/${ep.id}`, "PATCH", { active: !ep.active });
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  async function remove(ep: Endpoint) {
    if (!window.confirm("حذف هذه النقطة وكل سجل تسليمها؟")) return;
    const res = await callApi(`${base}/webhooks/${ep.id}`, "DELETE");
    if (!res.ok) setError(res.error);
    else onChanged();
  }

  async function test(ep: Endpoint) {
    setMessage(null);
    setError(null);
    const res = await callApi<{ summary: { delivered: number } }>(`${base}/webhooks/${ep.id}/test`, "POST");
    if (!res.ok) setError(res.error);
    else setMessage(res.data?.summary.delivered ? "وصل الحدث التجريبي بنجاح." : "لم يصل الحدث — سيُعاد المحاولة تلقائياً.");
    onChanged();
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-display text-lg font-bold">ويب هوكس</h2>
      <p className="text-xs text-muted-foreground">
        رابط https عام فقط. كل طلب يحمل توقيع <span dir="ltr">X-Salam-Signature</span> للتحقق منه (راجع docs/API.md).
      </p>
      <form onSubmit={create} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">الرابط</span>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            type="url"
            dir="ltr"
            placeholder="https://example.com/hook"
            className={inputClass}
          />
        </label>
        <fieldset>
          <legend className="mb-1 text-xs text-muted-foreground">الأحداث (بلا اختيار = الكل)</legend>
          <div className="flex flex-wrap gap-2">
            {data.events.map((ev) => (
              <label
                key={ev}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-sm ${
                  events.includes(ev) ? "border-primary bg-primary/10" : "border-border bg-surface"
                }`}
              >
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={() => setEvents((p) => (p.includes(ev) ? p.filter((x) => x !== ev) : [...p, ev]))}
                />
                <span dir="ltr">{ev}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={busy}>
          {busy ? "لحظة…" : "إضافة نقطة"}
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {message && <p className="text-sm text-success">{message}</p>}

      {secret && (
        <div role="status" className="space-y-2 rounded-xl border border-border bg-muted p-3">
          <p className="text-sm font-semibold">سرّ التوقيع — يُعرض مرة واحدة:</p>
          <code className="block break-all rounded-lg bg-surface p-2 text-xs" dir="ltr">
            {secret}
          </code>
          <Button type="button" variant="ghost" onClick={() => setSecret(null)}>
            تم، إخفاء
          </Button>
        </div>
      )}

      {data.endpoints.length === 0 ? (
        <Empty title="لا نقاط بعد." />
      ) : (
        <ul className="divide-y divide-border">
          {data.endpoints.map((ep) => (
            <li key={ep.id} className="space-y-1 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 break-all font-semibold" dir="ltr">
                  {ep.url}
                </span>
                <Badge tone={ep.active ? "good" : "neutral"}>{ep.active ? "فعّالة" : "موقوفة"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {ep.events.length ? ep.events.join("، ") : "كل الأحداث"} · بانتظار {ep.pending} · فاشلة {ep.failed}
              </p>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "اختبار", fn: () => test(ep) },
                  { label: ep.active ? "إيقاف" : "تفعيل", fn: () => toggle(ep) },
                  { label: "حذف", fn: () => remove(ep) },
                ].map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.fn}
                    className="cursor-pointer rounded-lg px-2 py-1 text-xs text-accent-ink hover:bg-muted"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
