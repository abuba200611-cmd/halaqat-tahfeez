import {
  RECOMMENDATION_LABELS,
  computeEvaluationTotal,
  recommendationFor,
  type EvalScores,
  type TeacherEvalConfig,
} from "@/lib/teacher-eval";
import { BrandLogo } from "./brand";

/*
  A3 — تقرير تقييم معلّم قابل للطباعة (أبيض/أسود صديق للورق): الترويسة،
  المؤشرات التلقائية، جدول المعايير بأوزانها ودرجاتها، الدرجة الكلية والتوصية،
  الملاحظات، وسطور التوقيع. يُعرض بصفحة الطباعة وتُخفي طباعة المتصفح ما حوله.
*/

export type TeacherEvalDocData = {
  mosqueName: string;
  teacherName: string;
  halaqahName: string;
  periodLabel: string;
  range: { from: string; to: string };
  config: TeacherEvalConfig;
  scores: EvalScores;
  notes: string;
  indicators: {
    attendanceRate: number | null;
    planOnTrackRatio: number | null;
    studentsPassed: number;
    juzPassed: number;
    khatmCount: number;
    meetsProductivity: boolean;
    teacherAbsenceDays: number | null;
  };
  evaluatedBy: string | null;
};

function show(value: number | null, suffix = ""): string {
  return value === null ? "غير متاح" : `${value}${suffix}`;
}

export function TeacherEvalDoc({ data }: { data: TeacherEvalDocData }) {
  const total = computeEvaluationTotal(data.config.criteria, data.scores);
  const recommendation = recommendationFor(total.totalPct, data.config.thresholds);
  const ind = data.indicators;

  return (
    <article dir="rtl" className="force-light mx-auto max-w-3xl bg-white p-6 text-black print:p-0">
      <header className="mb-4 border-b-2 border-secondary pb-3 text-center">
        <div className="flex justify-center">
          <BrandLogo size={40} />
        </div>
        <p className="mt-1 text-sm font-semibold">{data.mosqueName}</p>
        <h1 className="font-display text-2xl font-bold">تقرير تقييم المعلّم</h1>
        <p className="text-sm">{data.periodLabel}</p>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <p>
          <span className="font-semibold">المعلّم: </span>
          {data.teacherName}
        </p>
        <p>
          <span className="font-semibold">الحلقة: </span>
          {data.halaqahName}
        </p>
        <p className="tabular col-span-2">
          <span className="font-semibold">الفترة: </span>
          {data.range.from} إلى {data.range.to}
        </p>
      </section>

      <section className="mb-4">
        <h2 className="font-display mb-1 text-lg font-bold">المؤشرات التلقائية</h2>
        <table className="w-full border-collapse text-sm">
          <tbody>
            {[
              ["حضور طلاب الحلقة", show(ind.attendanceRate, "%")],
              ["طلاب على مسار الخطة", ind.planOnTrackRatio === null ? "غير متاح" : `${Math.round(ind.planOnTrackRatio * 100)}%`],
              ["طلاب اجتازوا اختبارات الأجزاء", String(ind.studentsPassed)],
              ["أجزاء مجتازة", String(ind.juzPassed)],
              ["حالات الختم", String(ind.khatmCount)],
              ["معيار الإنتاجية", ind.meetsProductivity ? "مستوفى" : "غير مستوفى"],
              ["أيام غياب المعلّم (مُدخل)", show(ind.teacherAbsenceDays)],
            ].map(([label, value]) => (
              <tr key={label} className="border border-black">
                <td className="border border-black px-2 py-1">{label}</td>
                <td className="tabular border border-black px-2 py-1">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mb-4">
        <h2 className="font-display mb-1 text-lg font-bold">معايير التقييم</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-stone-100 text-right">
              <th className="border border-black px-2 py-1">المعيار</th>
              <th className="border border-black px-2 py-1">الوزن</th>
              <th className="border border-black px-2 py-1">الدرجة (من ١٠٠)</th>
            </tr>
          </thead>
          <tbody>
            {data.config.criteria.map((c) => (
              <tr key={c.key}>
                <td className="border border-black px-2 py-1">{c.label}</td>
                <td className="tabular border border-black px-2 py-1">{c.weight}</td>
                <td className="tabular border border-black px-2 py-1">{show(data.scores[c.key] ?? null)}</td>
              </tr>
            ))}
            <tr className="bg-stone-100 font-semibold">
              <td className="border border-black px-2 py-1">الدرجة الكلية</td>
              <td className="border border-black px-2 py-1" />
              <td className="tabular border border-black px-2 py-1">{show(total.totalPct, "%")}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="mb-4 text-sm">
        <p>
          <span className="font-semibold">التوصية: </span>
          {recommendation ? RECOMMENDATION_LABELS[recommendation] : "التقييم غير مكتمل"}
        </p>
        {!ind.meetsProductivity && (
          <p className="mt-1">
            ملاحظة: معيار الإنتاجية (حدّ المجتازين أو الختم) غير مستوفى بهذه الفترة.
          </p>
        )}
        {data.notes.trim() !== "" && (
          <p className="mt-2 whitespace-pre-wrap">
            <span className="font-semibold">ملاحظات: </span>
            {data.notes}
          </p>
        )}
      </section>

      <footer className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p>المقيِّم{data.evaluatedBy ? `: ${data.evaluatedBy}` : ""}</p>
          <p className="mt-6 border-t border-black pt-1">التوقيع</p>
        </div>
        <div>
          <p>المعلّم</p>
          <p className="mt-6 border-t border-black pt-1">التوقيع</p>
        </div>
      </footer>
    </article>
  );
}
