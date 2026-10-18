"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import {
  EVAL_NOTES_MAX,
  RECOMMENDATION_LABELS,
  computeEvaluationTotal,
  recommendationFor,
  type EvalScores,
  type EvalTerm,
  type TeacherEvalConfig,
} from "@/lib/teacher-eval";

/*
  A3 — نموذج تقييم معلّم لفترة: مؤشرات تلقائية للقراءة (الحضور، الخطط،
  الاختبارات، الإنتاجية)، درجة لكل معيار (٠..١٠٠) بوزنه، أيام غياب المعلّم
  (إدخال يدوي إن سُجّل)، والملاحظات. الدرجة الكلية والتوصية تُحسبان حيّاً هنا
  وتُعاد حسابتهما خادمياً عند الحفظ.
*/

type DetailData = {
  teacher: { id: number; name: string; halaqahId: number; halaqahName: string; role: "supervisor" | "assistant" };
  period: { year: number; term: EvalTerm; key: string; from: string; to: string };
  config: TeacherEvalConfig;
  indicators: {
    attendanceRate: number | null;
    planOnTrackRatio: number | null;
    studentsPassed: number;
    juzPassed: number;
    khatmCount: number;
    meetsProductivity: boolean;
    teacherAbsenceDays: number | null;
  };
  evaluation: { scores: EvalScores; notes: string; evaluatedBy: string; updatedAt: string } | null;
};

export default function TeacherEvalDetailPage() {
  return (
    <Suspense>
      <DetailInner />
    </Suspense>
  );
}

function DetailInner() {
  const routeParams = useParams<{ id: string; teacherId: string }>();
  const mosqueId = Number(routeParams.id);
  const teacherId = Number(routeParams.teacherId);
  const search = useSearchParams();
  const qs = new URLSearchParams();
  const year = search.get("year");
  const term = search.get("term");
  if (year) qs.set("year", year);
  if (term) qs.set("term", term);
  const suffix = qs.toString() === "" ? "" : `?${qs.toString()}`;

  const { data, status, loading, dataKey, reload } = useApi<DetailData>(
    `/api/mosques/${mosqueId}/teacher-eval/${teacherId}${suffix}`,
  );

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/teacher-eval`} title="تقييم معلّم">
      <ApiState loading={loading && !data} status={status} mosqueId={mosqueId} featureName="تقييم المعلّمين والحوافز" />
      {data && (
        <EvalForm key={dataKey} mosqueId={mosqueId} suffix={suffix} data={data} onSaved={reload} />
      )}
      {!data && !loading && status === 404 && (
        <Empty
          title="المعلّم غير موجود في هذا الجامع."
          action={
            <Link href={`/mosque/${mosqueId}/teacher-eval`} className="text-sm text-accent-ink hover:underline">
              العودة للقائمة
            </Link>
          }
        />
      )}
    </MosquePage>
  );
}

function pct(value: number | null): string {
  return value === null ? "غير متاح" : `${value}%`;
}

function EvalForm({
  mosqueId,
  suffix,
  data,
  onSaved,
}: {
  mosqueId: number;
  suffix: string;
  data: DetailData;
  onSaved: () => void;
}) {
  const { config, indicators } = data;
  const [scores, setScores] = useState<Record<string, string>>(() =>
    Object.fromEntries(config.criteria.map((c) => [c.key, String(data.evaluation?.scores[c.key] ?? "")])),
  );
  const [notes, setNotes] = useState(data.evaluation?.notes ?? "");
  const [absence, setAbsence] = useState(indicators.teacherAbsenceDays === null ? "" : String(indicators.teacherAbsenceDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const numeric: EvalScores = Object.fromEntries(
    config.criteria.map((c) => [c.key, scores[c.key] === "" ? null : Number(scores[c.key])]),
  );
  const total = computeEvaluationTotal(config.criteria, numeric);
  const recommendation = recommendationFor(total.totalPct, config.thresholds);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    const res = await callApi(`/api/mosques/${mosqueId}/teacher-eval/${data.teacher.id}${suffix}`, "PUT", {
      scores: numeric,
      notes,
      teacherAbsenceDays: absence === "" ? null : Number(absence),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setSaved(true);
    onSaved();
  }

  const printHref = `/mosque/${mosqueId}/teacher-eval/${data.teacher.id}/print${suffix}`;

  return (
    <div className="space-y-5">
      <Card className="space-y-1 p-4">
        <p className="font-semibold">{data.teacher.name}</p>
        <p className="text-xs text-muted-foreground">
          {data.teacher.halaqahName} · {data.teacher.role === "assistant" ? "مساعد" : "مشرف"}
        </p>
        <p className="tabular text-xs text-muted-foreground">
          الفترة {data.period.key}: {data.period.from} → {data.period.to}
        </p>
      </Card>

      <Card className="space-y-2 p-4">
        <h2 className="font-display text-lg font-bold">المؤشرات التلقائية</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-2"><dt>حضور طلاب الحلقة</dt><dd className="tabular">{pct(indicators.attendanceRate)}</dd></div>
          <div className="flex justify-between gap-2">
            <dt>طلاب على مسار الخطة</dt>
            <dd className="tabular">{indicators.planOnTrackRatio === null ? "غير متاح" : `${Math.round(indicators.planOnTrackRatio * 100)}%`}</dd>
          </div>
          <div className="flex justify-between gap-2"><dt>طلاب اجتازوا اختبارات</dt><dd className="tabular">{indicators.studentsPassed}</dd></div>
          <div className="flex justify-between gap-2"><dt>أجزاء مجتازة</dt><dd className="tabular">{indicators.juzPassed}</dd></div>
          <div className="flex justify-between gap-2"><dt>حالات الختم</dt><dd className="tabular">{indicators.khatmCount}</dd></div>
          <div className="flex justify-between gap-2">
            <dt>معيار الإنتاجية</dt>
            <dd><Badge tone={indicators.meetsProductivity ? "good" : "warn"}>{indicators.meetsProductivity ? "مستوفى" : "غير مستوفى"}</Badge></dd>
          </div>
        </dl>
        <p className="text-xs text-muted-foreground">
          الإنتاجية: ≥ {config.productivity.minStudentsPassed} طلاب مجتازين أو {config.productivity.minKhatm} ختم بالفترة.
          الحضور والخطط من مقاييس الحلقة لنفس الفترة (الخطط: شهرها الجاري).
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-bold">التقييم</h2>
        {config.criteria.map((c) => (
          <label key={c.key} className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">
            <span>
              {c.label} <span className="tabular text-xs text-muted-foreground">(وزن {c.weight})</span>
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={scores[c.key]}
              onChange={(e) => setScores((prev) => ({ ...prev, [c.key]: e.target.value }))}
              className={inputClass}
              placeholder="٠-١٠٠"
            />
          </label>
        ))}
        <label className="grid grid-cols-[1fr_6rem] items-center gap-3 text-sm">
          <span>
            أيام غياب المعلّم <span className="text-xs text-muted-foreground">(إدخال يدوي إن سُجّل)</span>
          </span>
          <input type="number" min={0} max={366} value={absence} onChange={(e) => setAbsence(e.target.value)} className={inputClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">ملاحظات</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, EVAL_NOTES_MAX))}
            rows={3}
            className={inputClass}
            maxLength={EVAL_NOTES_MAX}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-sm">الدرجة الكلية:</span>
          <Badge tone="good">{total.totalPct === null ? "—" : `${total.totalPct}%`}</Badge>
          {recommendation ? (
            <Badge tone={recommendation === "renew" ? "good" : recommendation === "renew_remedial" ? "warn" : "neutral"}>
              {RECOMMENDATION_LABELS[recommendation]}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">تظهر التوصية عند اكتمال كل المعايير</span>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {saved && <p className="text-sm text-success">حُفظ التقييم.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={save}>
            {busy ? "لحظة…" : "حفظ التقييم"}
          </Button>
          <Link href={printHref} className="rounded-full border border-border px-4 py-1.5 text-sm font-medium hover:bg-muted">
            تقرير للطباعة
          </Link>
        </div>
      </Card>
    </div>
  );
}
