import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import {
  buildIncentiveReport,
  listEvalTeachers,
  listEvaluations,
  resolveEvalPeriod,
} from "@/lib/teacher-eval-db";
import { computeEvaluationTotal, recommendationFor, TEACHER_EVAL_FEATURE_KEY } from "@/lib/teacher-eval";
import { logServerError } from "@/lib/dev-error-log";

/*
  A3 — تقييم المعلّمين والحوافز لإدارة الجامع: قائمة معلّمي الجامع مع حالة
  تقييم كل منهم للفترة (?year=1448&term=year|1|2) + تقرير الحوافز المحسوب
  (عرض فقط — لا مدفوعات). الإعدادات في /settings والنموذج في /[teacherId].
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, TEACHER_EVAL_FEATURE_KEY);
  if (gate) return gate;

  try {
    const resolved = await resolveEvalPeriod(mosqueId, new URL(request.url).searchParams);
    if (!resolved.ok) return Response.json({ error: resolved.error }, { status: 400 });
    const { period } = resolved;

    const [teachers, evaluations, incentives] = await Promise.all([
      listEvalTeachers(mosqueId),
      listEvaluations(mosqueId, period.key),
      buildIncentiveReport(mosqueId, period.range, period.config),
    ]);
    const byTeacher = new Map(evaluations.map((e) => [e.teacherId, e]));
    return Response.json({
      period: { year: period.year, term: period.term, key: period.key, ...period.range },
      config: period.config,
      teachers: teachers.map((teacher) => {
        const stored = byTeacher.get(teacher.id) ?? null;
        // الدرجة والتوصية تُعاد من الدرجات المخزّنة بإعدادات اليوم (لا لقطة قديمة)
        const total = stored ? computeEvaluationTotal(period.config.criteria, stored.scores) : null;
        return {
          ...teacher,
          evaluation: stored
            ? {
                totalPct: total?.totalPct ?? null,
                complete: total?.complete ?? false,
                recommendation: recommendationFor(total?.totalPct ?? null, period.config.thresholds),
                updatedAt: stored.updatedAt,
              }
            : null,
        };
      }),
      incentives,
    });
  } catch (error) {
    await logServerError("mosque-teacher-eval:get", error);
    throw error;
  }
}
