"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import {
  DEFAULT_TEACHER_EVAL_CONFIG,
  RECOMMENDATION_LABELS,
  type EvalTerm,
  type IncentiveReport,
  type Recommendation,
  type TeacherEvalConfig,
} from "@/lib/teacher-eval";

/*
  A3 — تقييم المعلّمين والحوافز: اختيار الفترة (عام/فصل)، حالة تقييم كل معلّم
  بدرجته وتوصيته، تقرير الحوافز المحسوب (عرض فقط — لا مدفوعات)، والإعدادات
  (المعايير والأوزان والعتبات والمبالغ). النموذج الكامل في صفحة المعلّم.
*/

type ListData = {
  period: { year: number; term: EvalTerm; key: string; from: string; to: string };
  config: TeacherEvalConfig;
  teachers: {
    id: number;
    name: string;
    halaqahId: number;
    halaqahName: string;
    role: "supervisor" | "assistant";
    evaluation: { totalPct: number | null; complete: boolean; recommendation: Recommendation | null; updatedAt: string } | null;
  }[];
  incentives: {
    halaqat: { halaqahId: number; halaqahName: string; teacherNames: string; report: IncentiveReport }[];
    total: IncentiveReport;
  };
};

const TERM_LABELS: Record<EvalTerm, string> = { year: "العام كاملاً", "1": "الفصل الأول", "2": "الفصل الثاني" };
const REC_TONE: Record<Recommendation, "good" | "warn" | "neutral"> = {
  renew: "good",
  renew_remedial: "warn",
  not_recommended: "neutral",
};

export default function MosqueTeacherEvalPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const [year, setYear] = useState("");
  const [term, setTerm] = useState<EvalTerm>("year");
  const query = new URLSearchParams();
  if (/^\d{4}$/.test(year)) query.set("year", year);
  query.set("term", term);
  const { data, status, loading, reload } = useApi<ListData>(`/api/mosques/${mosqueId}/teacher-eval?${query.toString()}`);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/teacher-eval`} title="تقييم المعلّمين والحوافز">
      <ApiState loading={loading && !data} status={status} mosqueId={mosqueId} featureName="تقييم المعلّمين والحوافز" />
      <div className="space-y-5">
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">العام الدراسي (هجري)</span>
            <input
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder={data ? String(data.period.year) : "الحالي"}
              inputMode="numeric"
              className={`${inputClass} w-28`}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">الفترة</span>
            <select value={term} onChange={(e) => setTerm(e.target.value as EvalTerm)} className={inputClass}>
              {(Object.keys(TERM_LABELS) as EvalTerm[]).map((t) => (
                <option key={t} value={t}>
                  {TERM_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          {data && (
            <p className="tabular text-xs text-muted-foreground">
              {data.period.from} → {data.period.to}
            </p>
          )}
        </Card>

        {data && (
          <>
            <section className="space-y-2">
              <h2 className="font-naskh text-lg font-bold">المعلّمون</h2>
              {data.teachers.length === 0 ? (
                <Empty title="لا معلّمين فعّالين في حلقات هذا الجامع." />
              ) : (
                data.teachers.map((t) => (
                  <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.halaqahName} · {t.role === "assistant" ? "مساعد" : "مشرف"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {t.evaluation === null ? (
                        <Badge>لم يُقيَّم</Badge>
                      ) : t.evaluation.totalPct === null ? (
                        <Badge tone="warn">تقييم ناقص</Badge>
                      ) : (
                        <>
                          <Badge tone="good">{t.evaluation.totalPct}%</Badge>
                          {t.evaluation.recommendation && (
                            <Badge tone={REC_TONE[t.evaluation.recommendation]}>
                              {RECOMMENDATION_LABELS[t.evaluation.recommendation]}
                            </Badge>
                          )}
                        </>
                      )}
                      <Link
                        href={`/mosque/${mosqueId}/teacher-eval/${t.id}?year=${data.period.year}&term=${data.period.term}`}
                        className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                      >
                        {t.evaluation ? "فتح التقييم" : "تقييم"}
                      </Link>
                    </div>
                  </Card>
                ))
              )}
            </section>

            <IncentivesSection data={data} />

            <SettingsCard mosqueId={mosqueId} initial={data.config} onSaved={reload} />
          </>
        )}
      </div>
    </MosquePage>
  );
}

function money(n: number, currency: string): string {
  return `${n.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ${currency}`;
}

function IncentivesSection({ data }: { data: ListData }) {
  const currency = data.config.incentives.currency;
  return (
    <section className="space-y-2">
      <h2 className="font-naskh text-lg font-bold">تقرير الحوافز</h2>
      <p className="text-xs text-muted-foreground">
        محسوب من الاختبارات المجتازة بالفترة (الجزء بسعره، والختم بسعره وحده) — للعرض فقط، لا تُنفَّذ مدفوعات من هنا.
      </p>
      {data.incentives.halaqat.every((h) => h.report.lines.length === 0) ? (
        <Empty title="لا اختبارات مجتازة في هذه الفترة." />
      ) : (
        <>
          {data.incentives.halaqat
            .filter((h) => h.report.lines.length > 0)
            .map((h) => (
              <Card key={h.halaqahId} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {h.halaqahName} <span className="text-xs font-normal text-muted-foreground">{h.teacherNames}</span>
                  </p>
                  <p className="tabular text-xs text-muted-foreground">
                    حافز المعلّم (للحلقة): {money(h.report.teacherTotal, currency)}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-xs text-muted-foreground">
                        <th className="py-1 font-medium">الطالب</th>
                        <th className="py-1 font-medium">أجزاء</th>
                        <th className="py-1 font-medium">ختم</th>
                        <th className="py-1 font-medium">حافز الطالب</th>
                      </tr>
                    </thead>
                    <tbody>
                      {h.report.lines.map((l) => (
                        <tr key={l.studentId} className="border-t border-border">
                          <td className="py-1">{l.studentName}</td>
                          <td className="tabular py-1">{l.juz}</td>
                          <td className="tabular py-1">{l.khatm}</td>
                          <td className="tabular py-1">{money(l.studentAmount, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          <Card className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <span className="font-semibold">إجمالي الجامع</span>
            <span className="tabular">
              طلاب: {money(data.incentives.total.studentTotal, currency)} · معلّمون: {money(data.incentives.total.teacherTotal, currency)}
            </span>
          </Card>
        </>
      )}
    </section>
  );
}

const NUM_FIELDS: { section: "thresholds" | "productivity"; key: string; label: string; min: number; max: number }[] = [
  { section: "thresholds", key: "renewMin", label: "حدّ التوصية بالتجديد (%)", min: 1, max: 100 },
  { section: "thresholds", key: "remedialMin", label: "حدّ التجديد مع خطة علاجية (%)", min: 0, max: 100 },
  { section: "productivity", key: "minStudentsPassed", label: "إنتاجية: أقل عدد طلاب مجتازين", min: 1, max: 500 },
  { section: "productivity", key: "minKhatm", label: "أو عدد حالات الختم", min: 1, max: 50 },
];

const RATE_FIELDS: { key: keyof TeacherEvalConfig["incentives"]; label: string }[] = [
  { key: "studentPerJuz", label: "الطالب: لكل جزء" },
  { key: "studentPerKhatm", label: "الطالب: لكل ختم" },
  { key: "teacherPerJuz", label: "المعلّم: لكل جزء" },
  { key: "teacherPerKhatm", label: "المعلّم: لكل ختم" },
];

function SettingsCard({ mosqueId, initial, onSaved }: { mosqueId: number; initial: TeacherEvalConfig; onSaved: () => void }) {
  const [config, setConfig] = useState<TeacherEvalConfig>(initial);
  const [seen, setSeen] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  if (seen !== initial) {
    setSeen(initial);
    setConfig(initial);
  }

  const totalWeight = config.criteria.reduce((sum, c) => sum + c.weight, 0);

  function setCriterion(index: number, patch: Partial<TeacherEvalConfig["criteria"][number]>) {
    setConfig((prev) => ({ ...prev, criteria: prev.criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)) }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await callApi(`/api/mosques/${mosqueId}/teacher-eval/settings`, "PUT", config);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    onSaved();
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-naskh text-lg font-bold">إعدادات التقييم والحوافز</h2>
        <Button variant="ghost" type="button" onClick={() => setConfig(DEFAULT_TEACHER_EVAL_CONFIG)}>
          الافتراضيات
        </Button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">
          المعايير والأوزان <span className="tabular text-xs font-normal text-muted-foreground">(مجموع الأوزان {totalWeight})</span>
        </p>
        {config.criteria.map((c, index) => (
          <div key={c.key} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
            <input value={c.label} onChange={(e) => setCriterion(index, { label: e.target.value })} className={inputClass} maxLength={60} />
            <input
              type="number"
              min={1}
              max={100}
              value={c.weight}
              onChange={(e) => setCriterion(index, { weight: Number(e.target.value) || 0 })}
              className={inputClass}
            />
            <button
              type="button"
              className="cursor-pointer rounded-lg px-2 py-1 text-xs text-destructive hover:bg-muted disabled:opacity-40"
              disabled={config.criteria.length <= 1}
              onClick={() => setConfig((prev) => ({ ...prev, criteria: prev.criteria.filter((_, i) => i !== index) }))}
            >
              حذف
            </button>
          </div>
        ))}
        <Button
          variant="ghost"
          type="button"
          onClick={() =>
            setConfig((prev) => ({
              ...prev,
              criteria: [...prev.criteria, { key: `c${Date.now().toString(36)}`, label: "معيار جديد", weight: 10 }],
            }))
          }
        >
          إضافة معيار
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {NUM_FIELDS.map((field) => (
          <label key={`${field.section}.${field.key}`} className="block text-sm">
            <span className="mb-1 block">{field.label}</span>
            <input
              type="number"
              min={field.min}
              max={field.max}
              value={(config[field.section] as Record<string, number>)[field.key]}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  [field.section]: { ...prev[field.section], [field.key]: Number(e.target.value) || 0 },
                }))
              }
              className={inputClass}
            />
          </label>
        ))}
        <label className="block text-sm">
          <span className="mb-1 block">أشهر الفصل الأول (من بداية العام)</span>
          <input
            type="number"
            min={1}
            max={11}
            value={config.termSplitMonths}
            onChange={(e) => setConfig((prev) => ({ ...prev, termSplitMonths: Number(e.target.value) || 0 }))}
            className={inputClass}
          />
        </label>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">مبالغ الحوافز</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RATE_FIELDS.map((field) => (
            <label key={field.key} className="block text-sm">
              <span className="mb-1 block">{field.label}</span>
              <input
                type="number"
                min={0}
                step="0.5"
                value={config.incentives[field.key] as number}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, incentives: { ...prev.incentives, [field.key]: Number(e.target.value) || 0 } }))
                }
                className={inputClass}
              />
            </label>
          ))}
          <label className="block text-sm">
            <span className="mb-1 block">العملة</span>
            <input
              value={config.incentives.currency}
              onChange={(e) => setConfig((prev) => ({ ...prev, incentives: { ...prev.incentives, currency: e.target.value } }))}
              className={inputClass}
              maxLength={12}
            />
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-emerald-700">حُفظت الإعدادات.</p>}
      <Button type="button" disabled={busy} onClick={save}>
        {busy ? "لحظة…" : "حفظ الإعدادات"}
      </Button>
    </Card>
  );
}
