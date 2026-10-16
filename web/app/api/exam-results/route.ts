import { currentTeacher, unauthorized } from "@/lib/auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { isFeatureEnabled } from "@/lib/mosque/db";
import { text } from "@/lib/mosque/api-gate";
import {
  effectiveDeductions,
  getExamConfig,
  getExamType,
  getNominationById,
  isSessionExaminer,
  recordResult,
} from "@/lib/mosque/exams-db";
import { parseErrorCounts, scoreExam } from "@/lib/mosque/exams";
import { notifyExamPublished } from "@/lib/mosque/exam-notify";

/*
  تسجيل نتيجة ترشيح — الممتحن معلّم بلجنة جلسة الترشيح حصراً (غيره 404).
  الدرجة تُحسب خادمياً من عدّادات الأخطاء بقواعد النوع فوق إعدادات الجامع
  (لقطة تُخزَّن مع النتيجة)، وpublish=true ينشرها فوراً ويشعِر.
*/
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`exam-record:${teacher.id}`, 300, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const nominationId = Number(body.nominationId);
  if (!Number.isInteger(nominationId) || nominationId < 1) {
    return Response.json({ error: "nominationId مطلوب" }, { status: 400 });
  }
  const publish = body.publish === true;

  const nomination = await getNominationById(nominationId);
  if (!nomination) return Response.json({ error: "غير موجود" }, { status: 404 });
  if (!nomination.sessionId || !(await isSessionExaminer(nomination.sessionId, teacher.id))) {
    return Response.json({ error: "غير موجود" }, { status: 404 });
  }
  if (nomination.status !== "scheduled" && nomination.status !== "done") {
    return Response.json({ error: "الترشيح ليس بجلسة مجدولة" }, { status: 400 });
  }
  if (!(await isFeatureEnabled(nomination.mosqueId, "exams"))) {
    return Response.json({ error: "الاختبارات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }

  const config = await getExamConfig(nomination.mosqueId);
  const errors = parseErrorCounts(body.errors, config.maxErrorCountPerKind);
  if (!errors) return Response.json({ error: "عدّادات الأخطاء غير صحيحة" }, { status: 400 });

  const type = await getExamType(nomination.mosqueId, nomination.typeId);
  if (!type) return Response.json({ error: "نوع الاختبار غير موجود" }, { status: 404 });
  const rules = {
    maxScore: type.maxScore,
    passMark: type.passMark,
    deductions: effectiveDeductions(type.errorRules, config),
  };
  const { score, passed } = scoreExam(rules, errors);

  const outcome = await recordResult(
    nomination.mosqueId,
    {
      nominationId: nomination.id,
      sessionId: nomination.sessionId,
      halaqahId: nomination.halaqahId,
      studentId: nomination.studentId,
      juzFrom: nomination.juzFrom,
      juzTo: nomination.juzTo,
      maxScore: rules.maxScore,
      passMark: rules.passMark,
      errors,
      score,
      passed,
      examinerId: teacher.id,
      notes: text(body.notes, 500),
    },
    publish,
  );
  if (outcome === "published") {
    return Response.json({ error: "النتيجة منشورة — اسحب نشرها من الإدارة قبل التعديل" }, { status: 409 });
  }
  if (!outcome) return Response.json({ error: "غير موجود" }, { status: 404 });

  notifyExamPublished(outcome.firstPublish, outcome.result);
  return Response.json({ result: outcome.result }, { status: 201 });
}
