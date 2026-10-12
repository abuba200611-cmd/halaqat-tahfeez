"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { ScheduleGrid } from "@/components/mosque/schedule-grid";
import { callApi, useApi } from "@/components/mosque/use-api";
import { PERIODS, PROGRAM_KINDS, REF_KINDS, WEEK_DAYS, programKindLabel } from "@/lib/mosque/schedule";
import type { ProgramKind, SchedulePeriod, ScheduleSlot } from "@/lib/mosque/db";

type Refs = {
  halaqahs: { id: number; name: string }[];
  families: { id: number; name: string }[];
  committees: { id: number; name: string }[];
};
type ScheduleData = { slots: ScheduleSlot[]; refs: Refs };

type Draft = {
  id: number | null;
  dayOfWeek: number;
  period: SchedulePeriod;
  startTime: string;
  title: string;
  programKind: ProgramKind;
  refId: string;
  location: string;
  notes: string;
};

const emptyDraft = (dayOfWeek: number, period: SchedulePeriod): Draft => ({
  id: null,
  dayOfWeek,
  period,
  startTime: "",
  title: "",
  programKind: "halaqah",
  refId: "",
  location: "",
  notes: "",
});

/** الجدول الأسبوعي: شبكة الأسبوع + نافذة إضافة/تعديل خانة + رابط العرض العام */
export default function SchedulePage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/schedule`} title="الجدول الأسبوعي">
      <ScheduleSection mosqueId={mosqueId} />
    </MosquePage>
  );
}

function ScheduleSection({ mosqueId }: { mosqueId: number }) {
  const base = `/api/mosques/${mosqueId}/schedule`;
  const { data, status, loading, reload } = useApi<ScheduleData>(base);
  const [draft, setDraft] = useState<Draft | null>(null);

  if (!data) return <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الجدول الأسبوعي" />;

  return (
    <div className="space-y-5">
      <PublicLinkCard mosqueId={mosqueId} />

      {data.slots.length === 0 && !draft ? (
        <Empty title="الجدول فارغ — أضف أول خانة بزر «+ إضافة» بأي فترة." />
      ) : (
        <Card className="p-3">
          <ScheduleGrid
            slots={data.slots}
            onAdd={(day, period) => setDraft(emptyDraft(day, period as SchedulePeriod))}
            onEdit={(slot) =>
              setDraft({
                id: slot.id,
                dayOfWeek: slot.dayOfWeek,
                period: slot.period,
                startTime: slot.startTime ?? "",
                title: slot.title,
                programKind: slot.programKind,
                refId: slot.refId === null ? "" : String(slot.refId),
                location: slot.location ?? "",
                notes: slot.notes ?? "",
              })
            }
          />
        </Card>
      )}

      {draft && <SlotModal base={base} refs={data.refs} draft={draft} onClose={() => setDraft(null)} onSaved={reload} />}
    </div>
  );
}

function PublicLinkCard({ mosqueId }: { mosqueId: number }) {
  const [copied, setCopied] = useState(false);
  const link = typeof window === "undefined" ? `/j/${mosqueId}/schedule` : `${window.location.origin}/j/${mosqueId}/schedule`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // الرابط ظاهر بالحقل ويمكن نسخه يدوياً
    }
  }

  return (
    <Card className="p-4">
      <p className="mb-1 text-sm font-semibold">رابط الجدول العام</p>
      <p className="mb-3 text-xs text-muted-foreground">
        نسخة للقراءة فقط تشاركها مع أهل الجامع — تظهر فقط ما دامت ميزة الجدول مفعّلة.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          dir="ltr"
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
        />
        <Button onClick={copy} className="shrink-0">
          {copied ? "نُسخ ✓" : "نسخ"}
        </Button>
      </div>
    </Card>
  );
}

function SlotModal({
  base,
  refs,
  draft,
  onClose,
  onSaved,
}: {
  base: string;
  refs: Refs;
  draft: Draft;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [local, setDraftLocal] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (changes: Partial<Draft>) => setDraftLocal((prev) => ({ ...prev, ...changes }));

  const refOptions =
    local.programKind === "halaqah" ? refs.halaqahs : local.programKind === "family" ? refs.families : refs.committees;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      dayOfWeek: local.dayOfWeek,
      period: local.period,
      startTime: local.startTime,
      title: local.title,
      programKind: local.programKind,
      refId: local.refId === "" ? null : Number(local.refId),
      location: local.location,
      notes: local.notes,
    };
    const result = local.id === null
      ? await callApi(base, "POST", body)
      : await callApi(`${base}/${local.id}`, "PATCH", body);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    onClose();
  }

  async function remove() {
    if (local.id === null) return;
    if (!window.confirm(`حذف «${local.title}» من الجدول؟`)) return;
    setBusy(true);
    setError(null);
    const result = await callApi(`${base}/${local.id}`, "DELETE");
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold">{local.id === null ? "خانة جديدة" : "تعديل الخانة"}</h3>
          <button type="button" onClick={onClose} className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            إغلاق
          </button>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              اليوم
              <select
                value={local.dayOfWeek}
                onChange={(e) => patch({ dayOfWeek: Number(e.target.value) })}
                className={`${inputClass} mt-1`}
              >
                {WEEK_DAYS.map((weekDay) => (
                  <option key={weekDay.value} value={weekDay.value}>
                    {weekDay.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              الفترة
              <select
                value={local.period}
                onChange={(e) => patch({ period: e.target.value as SchedulePeriod })}
                className={`${inputClass} mt-1`}
              >
                {PERIODS.map((period) => (
                  <option key={period.value} value={period.value}>
                    {period.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs text-muted-foreground">
            العنوان
            <input
              value={local.title}
              onChange={(e) => patch({ title: e.target.value })}
              maxLength={200}
              required
              placeholder="مثال: حلقة الفجر — الجزء الأول"
              className={`${inputClass} mt-1`}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted-foreground">
              وقت البداية (اختياري)
              <input
                type="time"
                value={local.startTime}
                onChange={(e) => patch({ startTime: e.target.value })}
                className={`${inputClass} tabular mt-1`}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              نوع البرنامج
              <select
                value={local.programKind}
                onChange={(e) => patch({ programKind: e.target.value as ProgramKind, refId: "" })}
                className={`${inputClass} mt-1`}
              >
                {PROGRAM_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {REF_KINDS.includes(local.programKind) && (
            <label className="block text-xs text-muted-foreground">
              الربط ({programKindLabel(local.programKind)} من الجامع — اختياري)
              {refOptions.length === 0 ? (
                <p className="mt-1 rounded-xl bg-muted px-3 py-2 text-xs">
                  لا توجد {programKindLabel(local.programKind)} — فعّل ميزتها وأضفها أولاً إن أردت الربط.
                </p>
              ) : (
                <select
                  value={local.refId}
                  onChange={(e) => patch({ refId: e.target.value })}
                  className={`${inputClass} mt-1`}
                >
                  <option value="">بلا ربط</option>
                  {refOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          <label className="block text-xs text-muted-foreground">
            المكان (اختياري)
            <input
              value={local.location}
              onChange={(e) => patch({ location: e.target.value })}
              maxLength={200}
              placeholder="مثال: المصلى الرئيسي"
              className={`${inputClass} mt-1`}
            />
          </label>

          <label className="block text-xs text-muted-foreground">
            ملاحظات (اختياري)
            <textarea
              value={local.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              maxLength={1000}
              rows={2}
              className={`${inputClass} mt-1`}
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
            {local.id === null ? (
              <span />
            ) : (
              <Button type="button" variant="danger" onClick={remove} disabled={busy}>
                حذف
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
                إلغاء
              </Button>
              <Button type="submit" disabled={busy || !local.title.trim()}>
                {busy ? "جارٍ الحفظ…" : "حفظ"}
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
