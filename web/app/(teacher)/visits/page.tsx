"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Empty } from "@/components/ui";
import { CRITERION_SCORE_MAX, VISIT_STATUS_LABELS } from "@/lib/supervisor-visits";
import type { VisitCriterion, VisitScores } from "@/lib/supervisor-visits";

/*
  B4 — زيارات المشرف التربوي بعين معلّم الحلقة: قراءة فقط للزيارات المنجزة
  لحلقته — الملاحظات والتوصيات ودرجات المعايير والدرجة الكلية. الحلقة من
  جلسة المعلّم حصراً، ولا يظهر شيء قبل إنجاز الزيارة.
*/

type TeacherVisit = {
  id: number;
  halaqahName: string;
  visitorName: string;
  scheduledFor: string;
  visitedAt: string | null;
  overallScore: number | null;
  notes: string;
  recommendations: string;
  scores: VisitScores;
};

type VisitsData = {
  enabled: boolean;
  halaqahName: string;
  criteria?: VisitCriterion[];
  visits: TeacherVisit[];
};

export default function TeacherVisitsPage() {
  const [data, setData] = useState<VisitsData | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teacher/visits")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((d: VisitsData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <Empty title="تعذّر تحميل الزيارات." />;
  if (!data) return <Empty title="جارٍ التحميل…" />;
  if (!data.enabled) {
    return <Empty title="ميزة زيارات المشرف التربوي غير مفعّلة لجامع حلقتك." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl font-bold">زيارات المشرف التربوي</h1>
        <p className="text-sm text-muted-foreground">
          زيارات منجزة لحلقة «{data.halaqahName}» — يظهر منها الملاحظات والتوصيات والدرجات.
        </p>
      </div>

      {data.visits.length === 0 ? (
        <Empty title="لا زيارات منجزة لحلقتك بعد." />
      ) : (
        data.visits.map((visit) => (
          <Card key={visit.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{visit.visitorName || "مشرف الزيارة"}</p>
                <p className="tabular text-xs text-muted-foreground">
                  موعد الزيارة: {visit.scheduledFor}
                  {visit.visitedAt ? ` · أُنجزت: ${visit.visitedAt.slice(0, 10)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{VISIT_STATUS_LABELS.done}</Badge>
                {visit.overallScore !== null && <Badge tone="good">{visit.overallScore} من ١٠٠</Badge>}
              </div>
            </div>

            {(visit.notes.trim() !== "" || visit.recommendations.trim() !== "") && (
              <div className="space-y-1.5 text-sm">
                {visit.notes.trim() !== "" && (
                  <p className="whitespace-pre-wrap">
                    <span className="font-semibold">ملاحظات: </span>
                    {visit.notes}
                  </p>
                )}
                {visit.recommendations.trim() !== "" && (
                  <p className="whitespace-pre-wrap">
                    <span className="font-semibold">توصيات: </span>
                    {visit.recommendations}
                  </p>
                )}
              </div>
            )}

            {(data.criteria ?? []).length > 0 && (
              <div>
                <button
                  type="button"
                  className="cursor-pointer text-sm font-semibold text-accent-ink hover:underline"
                  onClick={() => setOpenId((current) => (current === visit.id ? null : visit.id))}
                >
                  {openId === visit.id ? "إخفاء درجات المعايير" : "درجات المعايير"}
                </button>
                {openId === visit.id && (
                  <table className="mt-2 w-full text-sm">
                    <tbody>
                      {(data.criteria ?? []).map((criterion) => (
                        <tr key={criterion.key} className="border-t border-border">
                          <td className="py-1.5">{criterion.label}</td>
                          <td className="tabular w-20 py-1.5 text-left">
                            {visit.scores[criterion.key]
                              ? `${visit.scores[criterion.key].score} / ${CRITERION_SCORE_MAX}`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
