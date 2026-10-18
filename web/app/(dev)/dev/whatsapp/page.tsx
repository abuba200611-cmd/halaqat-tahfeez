"use client";

import { useState } from "react";
import { Card } from "@/components/ui";
import { callApi, useApi } from "@/components/mosque/use-api";
import { WHATSAPP_TEMPLATE_LABELS, type WhatsappTemplateKey } from "@/lib/notify/templates";

/*
  صادر واتساب (B1) — آخر 200 رسالة مع فلترة بالحالة أو الجامع، وإعادة
  إرسال الفاشل يدوياً (تُسجَّل بسجل التدقيق). القوالب تُعرض بأسمائها
  العربية من خريطة القوالب نفسها التي تُرسل بها الرسائل.
*/

type Row = {
  id: number;
  mosqueId: number | null;
  toPhone: string;
  template: string;
  params: Record<string, string>;
  status: "queued" | "sent" | "failed" | "skipped";
  error: string;
  ref: string | null;
  createdAt: string;
  sentAt: string | null;
};

const STATUS_LABEL: Record<Row["status"], string> = {
  queued: "بالانتظار",
  sent: "أُرسلت",
  failed: "فاشلة",
  skipped: "متخطاة",
};

const STATUS_TONE: Record<Row["status"], string> = {
  queued: "bg-amber-50 text-amber-700",
  sent: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
  skipped: "bg-slate-100 text-slate-500",
};

const SKIP_REASON: Record<string, string> = {
  provider_not_configured: "المزوّد غير مهيأ",
  cap_mosque: "تجاوز سقف الجامع اليومي",
  cap_recipient: "تجاوز سقف الرقم اليومي",
  invalid_phone: "رقم غير صالح",
};

export default function DevWhatsappOutboxPage() {
  const [status, setStatus] = useState("");
  const [mosque, setMosque] = useState("");
  const [resending, setResending] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const query = new URLSearchParams();
  if (status) query.set("status", status);
  if (mosque) query.set("mosque", mosque);
  const { data, loading, status: httpStatus, reload } = useApi<{ rows: Row[] }>(
    `/api/dev/whatsapp-outbox?${query.toString()}`,
  );
  const rows = data?.rows ?? null;

  async function resend(id: number) {
    setResending(id);
    setMessage(null);
    const outcome = await callApi<{ status: string }>("/api/dev/whatsapp-outbox", "POST", { id });
    setResending(null);
    if (outcome.ok) {
      setMessage(`أُعيد الإرسال — الحالة الآن: ${STATUS_LABEL[outcome.data?.status as Row["status"]] ?? outcome.data?.status}`);
      reload();
    } else {
      setMessage(outcome.error ?? "تعذّر إعادة الإرسال");
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-naskh text-2xl font-bold">صادر واتساب</h1>
        <p className="text-sm text-muted-foreground">آخر ٢٠٠ رسالة عبر الميزة — الأحدث أولاً.</p>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">الحالة</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="cursor-pointer rounded-lg border border-border bg-surface px-2 py-1"
          >
            <option value="">الكل</option>
            {Object.keys(STATUS_LABEL).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key as Row["status"]]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">الجامع</span>
          <input
            value={mosque}
            onChange={(e) => setMosque(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="رقم الجامع"
            dir="ltr"
            inputMode="numeric"
            className="tabular w-28 rounded-lg border border-border bg-surface px-2 py-1"
          />
        </label>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </Card>

      {loading ? (
        <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>
      ) : !rows ? (
        <Card className="p-4 text-sm text-destructive">
          {httpStatus === 401 ? "الجلسة انتهت — سجّل الدخول من جديد." : "تعذّر التحميل."}
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          لا رسائل بعد — الميزة معطّلة افتراضياً، وأول تفعيل وربط أولياء يظهران هنا.
        </Card>
      ) : (
        <Card className="p-2">
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[row.status]}`}>
                    {STATUS_LABEL[row.status]}
                  </span>
                  <span className="font-semibold">
                    {WHATSAPP_TEMPLATE_LABELS[row.template as WhatsappTemplateKey] ?? row.template}
                  </span>
                  <span dir="ltr" className="tabular text-xs text-muted-foreground">
                    {row.toPhone}
                  </span>
                  {row.mosqueId !== null && (
                    <span className="text-xs text-muted-foreground">جامع #{row.mosqueId}</span>
                  )}
                  <span className="tabular ms-auto text-xs text-muted-foreground">
                    {row.createdAt.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
                {row.error !== "" && (
                  <p className="mt-1 text-xs text-red-600">{SKIP_REASON[row.error] ?? row.error}</p>
                )}
                {row.status === "queued" && (
                  <p className="mt-1 text-xs text-amber-600">بانتظار محاولة الإرسال</p>
                )}
                {row.status === "failed" && (
                  <button
                    type="button"
                    onClick={() => resend(row.id)}
                    disabled={resending === row.id}
                    className="mt-1 cursor-pointer rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {resending === row.id ? "لحظة…" : "↺ إعادة الإرسال"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
