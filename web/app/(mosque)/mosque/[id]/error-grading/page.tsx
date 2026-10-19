"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button, Card } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import {
  DEFAULT_ERROR_GRADING_CONFIG,
  ERROR_BANDS_MAX,
  ERROR_LABEL_MAX,
  ERROR_TYPES_MAX,
  parseErrorGradingConfig,
  type ErrorGradingConfig,
} from "@/lib/error-grading";

/*
  إعدادات تقييم الورد بنقاط الأخطاء لمدير الجامع: درجة الأساس، أنواع الأخطاء
  وخصم كل نوع، وحدود التقديرات. يُتحقَّق منها هنا للتجربة ثم يعيد الخادم التحقق
  كاملاً ولا يثق بالعميل. تسري على هذا الجامع فقط.
*/

type SettingsResponse = { config: ErrorGradingConfig };

export default function ErrorGradingSettingsPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const { data, status, loading, reload } = useApi<SettingsResponse>(`/api/mosques/${mosqueId}/error-grading`);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/error-grading`} title="تقييم الورد بالنقاط">
      <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="تقييم الورد بنقاط الأخطاء" />
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
  initial: ErrorGradingConfig;
  onSaved: () => void;
}) {
  const [config, setConfig] = useState<ErrorGradingConfig>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setConfig(initial);
  }

  const edit = (next: ErrorGradingConfig) => {
    setConfig(next);
    setSaved(false);
  };

  function addType() {
    if (config.errorTypes.length >= ERROR_TYPES_MAX) return;
    let n = config.errorTypes.length + 1;
    while (config.errorTypes.some((t) => t.key === `custom_${n}`)) n++;
    edit({ ...config, errorTypes: [...config.errorTypes, { key: `custom_${n}`, label: "", points: 1 }] });
  }

  function addBand() {
    if (config.bands.length >= ERROR_BANDS_MAX) return;
    // يُدرج قبل الأخير (الأخير يبدأ من صفر دائماً) بحدّ وسطي قابل للتعديل
    const bands = [...config.bands];
    const last = bands.length - 1;
    const above = bands[last - 1]?.min ?? config.baseScore;
    bands.splice(last, 0, { label: "", min: Math.max(1, Math.floor(above / 2)) });
    edit({ ...config, bands });
  }

  async function save() {
    setError(null);
    setSaved(false);
    const checked = parseErrorGradingConfig(config);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setBusy(true);
    const res = await callApi(`/api/mosques/${mosqueId}/error-grading`, "PUT", checked.value);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    onSaved();
  }

  return (
    <div className="space-y-5">
      <Card className="flex items-center justify-between gap-3 p-4">
        <p className="text-xs text-muted-foreground">
          تُحسب درجة كل ورد = درجة الأساس − مجموع (خصم النوع × عدد أخطائه)، ولا تنزل عن صفر. تُطبَّق على هذا الجامع فقط،
          والتقييمات السابقة تحتفظ بتقديرها وقت التقييم.
        </p>
        <Button variant="ghost" onClick={() => edit(DEFAULT_ERROR_GRADING_CONFIG)}>
          الافتراضيات
        </Button>
      </Card>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm text-success">حُفظت الإعدادات.</p>}

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-bold">درجة الأساس</h2>
        <label className="block max-w-40 text-sm">
          <span className="mb-1 block">الدرجة الكاملة</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            value={config.baseScore}
            onChange={(e) => edit({ ...config, baseScore: e.target.value === "" ? 0 : Number(e.target.value) })}
            className={inputClass}
          />
        </label>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-bold">أنواع الأخطاء</h2>
        <ul className="space-y-2">
          {config.errorTypes.map((type, i) => (
            <li key={type.key} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">الاسم</span>
                <input
                  value={type.label}
                  maxLength={ERROR_LABEL_MAX}
                  onChange={(e) =>
                    edit({
                      ...config,
                      errorTypes: config.errorTypes.map((t, k) => (k === i ? { ...t, label: e.target.value } : t)),
                    })
                  }
                  className={inputClass}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-muted-foreground">الخصم</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0.25}
                  step={0.25}
                  value={type.points}
                  onChange={(e) =>
                    edit({
                      ...config,
                      errorTypes: config.errorTypes.map((t, k) =>
                        k === i ? { ...t, points: e.target.value === "" ? 0 : Number(e.target.value) } : t,
                      ),
                    })
                  }
                  className={inputClass}
                />
              </label>
              <Button
                variant="danger"
                disabled={config.errorTypes.length <= 1}
                onClick={() => edit({ ...config, errorTypes: config.errorTypes.filter((_, k) => k !== i) })}
                aria-label={`حذف ${type.label || "النوع"}`}
                className="min-h-11"
              >
                حذف
              </Button>
            </li>
          ))}
        </ul>
        <Button variant="ghost" onClick={addType} disabled={config.errorTypes.length >= ERROR_TYPES_MAX}>
          + نوع خطأ
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-bold">التقديرات</h2>
        <p className="text-xs text-muted-foreground">من الأعلى إلى الأدنى؛ التقدير الأخير يشمل كل ما دون الذي قبله.</p>
        <ul className="space-y-2">
          {config.bands.map((band, i) => {
            const isLast = i === config.bands.length - 1;
            return (
              <li key={i} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">الاسم</span>
                  <input
                    value={band.label}
                    maxLength={ERROR_LABEL_MAX}
                    onChange={(e) =>
                      edit({
                        ...config,
                        bands: config.bands.map((b, k) => (k === i ? { ...b, label: e.target.value } : b)),
                      })
                    }
                    className={inputClass}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-muted-foreground">{isLast ? "من" : "من الدرجة"}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={band.min}
                    disabled={isLast}
                    onChange={(e) =>
                      edit({
                        ...config,
                        bands: config.bands.map((b, k) =>
                          k === i ? { ...b, min: e.target.value === "" ? 0 : Number(e.target.value) } : b,
                        ),
                      })
                    }
                    className={`${inputClass} disabled:opacity-60`}
                  />
                </label>
                <Button
                  variant="danger"
                  disabled={isLast || config.bands.length <= 2}
                  onClick={() => edit({ ...config, bands: config.bands.filter((_, k) => k !== i) })}
                  aria-label={`حذف ${band.label || "التقدير"}`}
                  className="min-h-11"
                >
                  حذف
                </Button>
              </li>
            );
          })}
        </ul>
        <Button variant="ghost" onClick={addBand} disabled={config.bands.length >= ERROR_BANDS_MAX}>
          + تقدير
        </Button>
      </Card>

      <Button onClick={save} disabled={busy}>
        {busy ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
      </Button>
    </div>
  );
}
