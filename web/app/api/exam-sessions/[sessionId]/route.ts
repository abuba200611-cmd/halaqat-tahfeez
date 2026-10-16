import { currentTeacher, unauthorized } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/mosque/db";
import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import {
  effectiveDeductions,
  getExamConfig,
  getExamType,
  getSessionById,
  isSessionExaminer,
  listSessionScoringRows,
} from "@/lib/mosque/exams-db";

/**
 * شاشة الممتحن — الجلسة وكشفها، للمعلّم بلجنتها فقط (غيره يرى 404 متطابقاً
 * مع غير الموجود). قواعد الخصم الفعلية (نوع × إعدادات الجامع) تُعاد معها
 * ليحسب العرض الدرجة لحظياً.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const sessionId = parsePositiveIntParam((await params).sessionId);
  if (sessionId === null) return paramNotFound();

  const session = await getSessionById(sessionId);
  if (!session) return Response.json({ error: "الجلسة غير موجودة" }, { status: 404 });
  if (!(await isSessionExaminer(sessionId, teacher.id))) {
    return Response.json({ error: "الجلسة غير موجودة" }, { status: 404 });
  }
  if (!(await isFeatureEnabled(session.mosqueId, "exams"))) {
    return Response.json({ error: "الاختبارات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }

  const config = await getExamConfig(session.mosqueId);
  const type = await getExamType(session.mosqueId, session.typeId);
  const deductions = effectiveDeductions(type?.errorRules ?? null, config);

  const rows = await listSessionScoringRows(session.mosqueId, sessionId);
  return Response.json({
    session,
    rules: { maxScore: type?.maxScore ?? config.maxScore, passMark: type?.passMark ?? config.passMark, deductions },
    maxErrorCountPerKind: config.maxErrorCountPerKind,
    rows,
  });
}
