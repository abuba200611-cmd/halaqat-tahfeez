"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { useApi, callApi } from "@/components/mosque/use-api";
import { DEFAULT_DISCIPLINE_CONFIG, DISCIPLINE_NOTE_MAX, type DisciplineConfig } from "@/lib/discipline";

/*
  A2 — إعدادات سُلّمي الانضباط: كل رقم قابل للضبط (الجوامع تختلف) —
  عتبات الغياب المتتالي والفصلي، أيام الإيقاف، التصنيفات، ونمط
  «حاضر افتراضياً». الحفظ يُدمج فوق الافتراضيات بحدود صارمة.
*/

type SettingsResponse = { config: DisciplineConfig };

type NumberField = { key: string; label: string; hint: string; min: number; max: number };

const ABSENCE_FIELDS: NumberField[] = [
  { key: "warn1ConsecutiveDays", label: "الإنذار الأول: أيام غياب متتالية", hint: "افتراضي ٣", min: 1, max: 60 },
  { key: "warn2TermAbsences", label: "الإنذار الثاني: غيابات الفصل", hint: "افتراضي ١٠", min: 1, max: 365 },
  { key: "termDays", label: "طول الفصل (أيام)", hint: "افتراضي ١٢٠", min: 7, max: 365 },
  { key: "consecutiveGapDays", label: "أقصى فجوة تُبقي الغياب متتالياً", hint: "افتراضي ٧ — الحلقة قد تجتمع أياماً متباعدة", min: 1, max: 60 },
  { key: "summonsConsecutiveDays", label: "استدعاء ولي الأمر: أيام غياب متتالية", hint: "افتراضي ٧", min: 1, max: 60 },
  { key: "adminAlertConsecutiveDays", label: "التنبيه الحرج للإدارة: أيام متتالية", hint: "افتراضي ٧", min: 1, max: 60 },
];

const VIOLATION_FIELDS: NumberField[] = [
  { key: "escalateEvery", label: "كم مخالفة لكل درجة في السُلّم", hint: "افتراضي ١ — كل مخالفة درجة", min: 1, max: 10 },
  { key: "suspensionDays", label: "أيام الإيقاف المؤقت", hint: "افتراضي ٣", min: 1, max: 60 },
];

export default function DisciplineSettingsPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const { data, status, loading, reload } = useApi<SettingsResponse>(`/api/mosques/${mosqueId}/discipline/settings`);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/discipline/settings`} title="إعدادات الانضباط">
      <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الانضباط والمتابعة" />
      {data && <SettingsForm mosqueId={mosqueId} initial={data.config} onSaved={reload} />}
    </MosquePage>
  );
}

function SettingsForm({
  mosqueId,
  initial,
  onSaved,
}: {
  mosqueId: number;
  initial: DisciplineConfig;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<DisciplineConfig>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setConfig(initial);
  }

  function setNumber(section: "absence" | "violations", key: string, value: string) {
    const num = value === "" ? 0 : Number(value);
    setConfig((prev) => ({ ...prev, [section]: { ...prev[section], [key]: num } }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await callApi(`/api/mosques/${mosqueId}/discipline/settings`, "PUT", config);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    onSaved();
  }

  function resetDefaults() {
    setConfig(DEFAULT_DISCIPLINE_CONFIG);
  }

  return (
    <div className="space-y-5">
      <Card className="flex items-center justify-between gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          عتبات سُلّمي الغياب والمخالفات — تُطبَّق على هذا الجامع فقط، والإعداد الغائب يعود للافتراضي.
        </p>
        <Button variant="ghost" onClick={resetDefaults}>
          الافتراضيات
        </Button>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-emerald-700">حُفظت الإعدادات.</p>}

      <Card className="space-y-3 p-4">
        <h2 className="font-naskh text-lg font-bold">سُلّم الغياب</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ABSENCE_FIELDS.map((field) => (
            <label key={field.key} className="block text-sm">
              <span className="mb-1 block">{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={config.absence[field.key as keyof typeof config.absence] as number}
                onChange={(e) => setNumber("absence", field.key, e.target.value)}
                className={inputClass}
              />
              <span className="mt-0.5 block text-xs text-muted-foreground">{field.hint}</span>
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.absence.defaultPresent}
            onChange={(e) => setConfig((p) => ({ ...p, absence: { ...p.absence, defaultPresent: e.target.checked } }))}
            className="h-4 w-4"
          />
          <span>
            نمط «حاضر افتراضياً» — كل طالب بلا تحديد في يوم اجتماع يُعدّ حاضراً بالملخّصات (لا يمسّ قرارات الغياب المخزَّنة)
          </span>
        </label>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-naskh text-lg font-bold">سُلّم المخالفات</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {VIOLATION_FIELDS.map((field) => (
            <label key={field.key} className="block text-sm">
              <span className="mb-1 block">{field.label}</span>
              <input
                type="number"
                min={field.min}
                max={field.max}
                value={config.violations[field.key as keyof typeof config.violations] as number}
                onChange={(e) => setNumber("violations", field.key, e.target.value)}
                className={inputClass}
              />
              <span className="mt-0.5 block text-xs text-muted-foreground">{field.hint}</span>
            </label>
          ))}
        </div>
        <label className="block text-sm">
          <span className="mb-1 block">تصنيفات المخالفات (سطر لكل تصنيف)</span>
          <textarea
            rows={5}
            maxLength={DISCIPLINE_NOTE_MAX}
            value={config.violations.categories.join("\n")}
            onChange={(e) =>
              setConfig((p) => ({
                ...p,
                violations: { ...p.violations, categories: e.target.value.split("\n").map((c) => c.trim()).filter(Boolean) },
              }))
            }
            className={inputClass}
          />
          <span className="mt-0.5 block text-xs text-muted-foreground">
            الافتراضي: {DEFAULT_DISCIPLINE_CONFIG.violations.categories.join("، ")}
          </span>
        </label>
      </Card>

      <Button onClick={save} disabled={busy}>
        {busy ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
      </Button>
    </div>
  );
}
