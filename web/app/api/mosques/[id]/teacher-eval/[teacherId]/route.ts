import { featureGate, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import { currentMosqueActor } from "@/lib/mosque/actor";
import {
  buildIncentiveReport,
  computeTeacherIndicators,
  getEvalTeacher,
  getEvaluation,
  resolveEvalPeriod,
  saveEvaluation,
} from "@/lib/teacher-eval-db";
import {
  computeEvaluationTotal,
  EVAL_NOTES_MAX,
  parseAbsenceDays,
  parseScoresBody,
  recommendationFor,
  TEACHER_EVAL_FEATURE_KEY,
} from "@/lib/teacher-eval";
import { logServerError } from "@/lib/dev-error-log";

/*
  A3 — نموذج تقييم معلّم واحد لفترة: GET يرجع المؤشرات التلقائية الحيّة
  (حضور الحلقة، تقدّم الخطط، الاختبارات، الإنتاجية) مع التقييم المخزّن وحوافز
  حلقته؛ PUT يحفظ الدرجات والملاحظات ويحسب الدرجة الكلية والتوصية خادمياً
  (لا يُصدَّق إجمالي قادم من العميل). المعلّم يُتحقَّق انتماؤه للجامع (404 وإلا).
*/

type RouteContext = { params: Promise<{ id: string; teacherId: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id, teacherId: teacherParam } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const teacherId = parsePositiveIntParam(teacherParam);
  if (mosqueId === null || teacherId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, TEACHER_EVAL_FEATURE_KEY);
  if (gate) return gate;

  try {
    const teacher = await getEvalTeacher(mosqueId, teacherId);
    if (!teacher) return paramNotFound();
    const resolved = await resolveEvalPeriod(mosqueId, new URL(request.url).searchParams);
    if (!resolved.ok) return Response.json({ error: resolved.error }, { status: 400 });
    const { period } = resolved;

    const stored = await getEvaluation(mosqueId, teacherId, period.key);
    const absence = stored?.indicators.teacherAbsenceDays ?? null;
    const [indicators, incentives] = await Promise.all([
      computeTeacherIndicators(mosqueId, teacher, period.range, period.config, absence),
      buildIncentiveReport(mosqueId, period.range, period.config),
    ]);
    const total = stored ? computeEvaluationTotal(period.config.criteria, stored.scores) : null;
    return Response.json({
      teacher,
      period: { year: period.year, term: period.term, key: period.key, ...period.range },
      config: period.config,
      indicators,
      evaluation: stored
        ? {
            scores: stored.scores,
            notes: stored.notes,
            evaluatedBy: stored.evaluatedBy,
            updatedAt: stored.updatedAt,
            totalPct: total?.totalPct ?? null,
            complete: total?.complete ?? false,
            recommendation: recommendationFor(total?.totalPct ?? null, period.config.thresholds),
          }
        : null,
      incentive: incentives.halaqat.find((h) => h.halaqahId === teacher.halaqahId) ?? null,
    });
  } catch (error) {
    await logServerError("mosque-teacher-eval-detail:get", error);
    throw error;
  }
}

/** حفظ التقييم: { scores: {مفتاح المعيار: ٠..١٠٠|null}, notes?, teacherAbsenceDays? } */
export async function PUT(request: Request, { params }: RouteContext) {
  const { id, teacherId: teacherParam } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const teacherId = parsePositiveIntParam(teacherParam);
  if (mosqueId === null || teacherId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, TEACHER_EVAL_FEATURE_KEY);
  if (gate) return gate;

  try {
    const teacher = await getEvalTeacher(mosqueId, teacherId);
    if (!teacher) return paramNotFound();
    const resolved = await resolveEvalPeriod(mosqueId, new URL(request.url).searchParams);
    if (!resolved.ok) return Response.json({ error: resolved.error }, { status: 400 });
    const { period } = resolved;

    const body = (await request.json().catch(() => ({}))) as {
      scores?: unknown;
      notes?: unknown;
      teacherAbsenceDays?: unknown;
    };
    const scores = parseScoresBody(body.scores, period.config.criteria);
    if (!scores.ok) return Response.json({ error: scores.error }, { status: 400 });
    const absence = parseAbsenceDays(body.teacherAbsenceDays);
    if (Number.isNaN(absence)) {
      return Response.json({ error: "أيام الغياب لازم تكون رقماً صحيحاً من ٠ إلى ٣٦٦" }, { status: 400 });
    }

    const actor = await currentMosqueActor();
    const saved = await saveEvaluation({
      mosqueId,
      teacher,
      year: period.year,
      term: period.term,
      scores: scores.scores,
      notes: text(body.notes, EVAL_NOTES_MAX),
      teacherAbsenceDays: absence,
      evaluatedBy: actor.label,
      config: period.config,
    });
    return Response.json({ ok: true, evaluation: saved });
  } catch (error) {
    await logServerError("mosque-teacher-eval-detail:put", error);
    throw error;
  }
}
