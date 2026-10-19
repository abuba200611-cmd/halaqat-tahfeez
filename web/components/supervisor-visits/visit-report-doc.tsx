import {
  CRITERION_SCORE_MAX,
  VISIT_STATUS_LABELS,
  computeOverallScore,
  type VisitCriterion,
  type VisitScores,
  type VisitStatus,
} from "@/lib/supervisor-visits";
import { BrandLogo } from "@/components/brand";

/*
  B4 — تقرير زيارة مشرف قابل للطباعة (أبيض/أسود صديق للورق): الترويسة
  بالشعار، بيانات الزيارة، جدول المعايير بدرجاتها (٠..٥) وملاحظاتها،
  الدرجة الكلية، الملاحظات والتوصيات، وسطور التوقيع. مشترك بين طباعة
  الجامع والجمعية، وتُخفي طباعة المتصفح ما حوله.
*/

export type VisitReportDocData = {
  mosqueName: string;
  halaqahName: string;
  visitorName: string;
  scheduledFor: string;
  visitedAt: string | null;
  status: VisitStatus;
  criteria: VisitCriterion[];
  scores: VisitScores;
  overallScore: number | null;
  notes: string;
  recommendations: string;
};

export function VisitReportDoc({ data }: { data: VisitReportDocData }) {
  const total = computeOverallScore(data.criteria, data.scores);
  const visitedLabel = data.visitedAt ? data.visitedAt.slice(0, 10) : "لم تُنجز بعد";

  return (
    <article dir="rtl" className="force-light mx-auto max-w-3xl bg-white p-6 text-black print:p-0">
      <header className="mb-4 border-b-2 border-secondary pb-3 text-center">
        <div className="flex justify-center">
          <BrandLogo size={40} />
        </div>
        <p className="mt-1 text-sm font-semibold">{data.mosqueName}</p>
        <h1 className="font-display text-2xl font-bold">تقرير زيارة المشرف التربوي</h1>
        <p className="text-sm">
          {VISIT_STATUS_LABELS[data.status]} · حلقة {data.halaqahName}
        </p>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <p>
          <span className="font-semibold">المشرف الزائر: </span>
          {data.visitorName || "—"}
        </p>
        <p>
          <span className="font-semibold">الحلقة: </span>
          {data.halaqahName}
        </p>
        <p className="tabular">
          <span className="font-semibold">موعد الزيارة: </span>
          {data.scheduledFor}
        </p>
        <p className="tabular">
          <span className="font-semibold">تاريخ الإنجاز: </span>
          {visitedLabel}
        </p>
      </section>

      <section className="mb-4">
        <h2 className="font-display mb-1 text-lg font-bold">معايير التقييم</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-stone-100 text-right">
              <th className="border border-black px-2 py-1">المعيار</th>
              <th className="border border-black px-2 py-1">الدرجة (من {CRITERION_SCORE_MAX})</th>
              <th className="border border-black px-2 py-1">ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {data.criteria.map((criterion) => {
              const entry = data.scores[criterion.key];
              return (
                <tr key={criterion.key}>
                  <td className="border border-black px-2 py-1">{criterion.label}</td>
                  <td className="tabular border border-black px-2 py-1">{entry ? entry.score : "—"}</td>
                  <td className="border border-black px-2 py-1">{entry?.note || ""}</td>
                </tr>
              );
            })}
            <tr className="bg-stone-100 font-semibold">
              <td className="border border-black px-2 py-1">الدرجة الكلية</td>
              <td className="tabular border border-black px-2 py-1">
                {total.overallScore === null ? "غير مكتملة" : `${total.overallScore} / 100`}
              </td>
              <td className="border border-black px-2 py-1" />
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-4 space-y-2 text-sm">
        {data.notes.trim() !== "" && (
          <p className="whitespace-pre-wrap">
            <span className="font-semibold">ملاحظات الزيارة: </span>
            {data.notes}
          </p>
        )}
        {data.recommendations.trim() !== "" && (
          <p className="whitespace-pre-wrap">
            <span className="font-semibold">التوصيات: </span>
            {data.recommendations}
          </p>
        )}
        {data.notes.trim() === "" && data.recommendations.trim() === "" && <p>لا ملاحظات مسجَّلة.</p>}
      </section>

      <footer className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p>المشرف الزائر{data.visitorName ? `: ${data.visitorName}` : ""}</p>
          <p className="mt-6 border-t border-black pt-1">التوقيع</p>
        </div>
        <div>
          <p>مشرف الحلقة</p>
          <p className="mt-6 border-t border-black pt-1">التوقيع</p>
        </div>
      </footer>
    </article>
  );
}
