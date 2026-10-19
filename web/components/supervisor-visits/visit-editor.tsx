"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/mosque/ui";
import { inputClass } from "@/components/mosque/mosque-page";
import { callApi } from "@/components/mosque/use-api";
import {
  CRITERION_SCORE_MAX,
  VISIT_STATUS_LABELS,
  computeOverallScore,
  type VisitCriterion,
  type VisitScores,
  type VisitStatus,
} from "@/lib/supervisor-visits";

/*
  B4 — نموذج تقييم زيارة مشترك بين لوحة الجامع ولوحة الجمعية: درجات
  المعايير (٠..٥) بملاحظاتها، والملاحظات والتوصيات، والدرجة الكلية محسوبة
  أمام العين بالدالة نفسها التي تحسبها الخادم — التي تبقى المرجع الوحيد
  عند الحفظ. الزيارة الملغاة تُعرض للقراءة فقط.
*/

export type VisitEditorData = {
  id: number;
  status: VisitStatus;
  halaqahName: string;
  mosqueName?: string;
  scheduledFor: string;
  visitedAt: string | null;
  visitorName: string;
  overallScore: number | null;
  notes: string;
  recommendations: string;
};

export function VisitEditor({
  apiBase,
  visit,
  criteria,
  initialScores,
  onSaved,
}: {
  apiBase: string;
  visit: VisitEditorData;
  criteria: VisitCriterion[];
  initialScores: VisitScores;
  onSaved: () => void;
}) {
  const [scores, setScores] = useState<VisitScores>(initialScores);
  const [notes, setNotes] = useState(visit.notes);
  const [recommendations, setRecommendations] = useState(visit.recommendations);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = computeOverallScore(criteria, scores);
  const cancelled = visit.status === "cancelled";

  function setScore(key: string, value: string) {
    setScores((prev) => {
      const next = { ...prev };
      if (value === "") delete next[key];
      else next[key] = { ...next[key], score: Number(value) };
      return next;
    });
  }

  async function submit(action: "save" | "done" | "cancel" | "reopen") {
    setBusy(action);
    setError(null);
    const res = await callApi<{ visit: VisitEditorData }>(apiBase, "PUT", { action, scores, notes, recommendations });
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">{visit.halaqahName}</p>
            <p className="text-xs text-muted-foreground">
              {visit.mosqueName ? `${visit.mosqueName} · ` : ""}المشرف الزائر: {visit.visitorName || "—"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={visit.status === "done" ? "good" : visit.status === "cancelled" ? "neutral" : "warn"}>
              {VISIT_STATUS_LABELS[visit.status]}
            </Badge>
            <Badge>
              الموعد: <span className="tabular">{visit.scheduledFor}</span>
            </Badge>
            {visit.visitedAt && (
              <Badge tone="good">
                أُنجزت: <span className="tabular">{visit.visitedAt.slice(0, 10)}</span>
              </Badge>
            )}
          </div>
        </div>
        <p className="tabular text-xs text-muted-foreground">
          الدرجة الكلية: {total.overallScore === null ? `غير مكتملة (${total.scoredCount}/${criteria.length} معايير)` : `${total.overallScore} من ١٠٠`}
        </p>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-bold">معايير التقييم</h2>
        <p className="text-xs text-muted-foreground">درجة كل معيار من ٠ إلى {CRITERION_SCORE_MAX}</p>
        {criteria.map((criterion) => {
          const current = scores[criterion.key];
          return (
            <div key={criterion.key} className="space-y-1.5 border-t border-border pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-0 flex-1 text-sm font-semibold">{criterion.label}</p>
                <select
                  value={current ? String(current.score) : ""}
                  onChange={(e) => setScore(criterion.key, e.target.value)}
                  disabled={cancelled}
                  className={`${inputClass} w-24`}
                >
                  <option value="">—</option>
                  {Array.from({ length: CRITERION_SCORE_MAX + 1 }, (_, score) => (
                    <option key={score} value={score}>
                      {score}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={current?.note ?? ""}
                onChange={(e) =>
                  setScores((prev) =>
                    prev[criterion.key]
                      ? { ...prev, [criterion.key]: { ...prev[criterion.key], note: e.target.value } }
                      : prev,
                  )
                }
                disabled={cancelled || !current}
                placeholder="ملاحظة على المعيار (اختياري)"
                maxLength={300}
                className={inputClass}
              />
            </div>
          );
        })}
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-display text-lg font-bold">الملاحظات والتوصيات</h2>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">ملاحظات الزيارة</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={cancelled}
            rows={3}
            maxLength={2000}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">التوصيات</span>
          <textarea
            value={recommendations}
            onChange={(e) => setRecommendations(e.target.value)}
            disabled={cancelled}
            rows={3}
            maxLength={2000}
            className={inputClass}
          />
        </label>
      </Card>

      {cancelled ? (
        <p className="text-sm text-muted-foreground">زيارة ملغاة — تُعرض للقراءة فقط ولا تُعدَّل.</p>
      ) : (
        <Card className="flex flex-wrap items-center gap-2 p-4">
          <Button type="button" disabled={busy !== null} onClick={() => submit("save")}>
            {busy === "save" ? "لحظة…" : visit.status === "done" ? "حفظ التعديلات" : "حفظ المسوّدة"}
          </Button>
          {visit.status === "scheduled" && (
            <>
              <Button type="button" disabled={busy !== null || !total.complete} onClick={() => submit("done")}>
                {busy === "done" ? "لحظة…" : "إنهاء الزيارة"}
              </Button>
              <Button type="button" variant="danger" disabled={busy !== null} onClick={() => submit("cancel")}>
                {busy === "cancel" ? "لحظة…" : "إلغاء الزيارة"}
              </Button>
            </>
          )}
          {visit.status === "done" && (
            <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => submit("reopen")}>
              {busy === "reopen" ? "لحظة…" : "إعادة فتح"}
            </Button>
          )}
          {!total.complete && visit.status === "scheduled" && (
            <p className="text-xs text-muted-foreground">إنهاء الزيارة يتطلب تقييم كل المعايير ({total.scoredCount}/{criteria.length}).</p>
          )}
        </Card>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
