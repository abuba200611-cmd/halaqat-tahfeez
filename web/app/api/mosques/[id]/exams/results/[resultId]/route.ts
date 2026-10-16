import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { setResultPublished } from "@/lib/mosque/exams-db";
import { notifyExamPublished } from "@/lib/mosque/exam-notify";

/** نشر نتيجة (تظهر للطالب وولي الأمر مع الإشعار) أو سحب نشرها */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; resultId: string }> }) {
  const { id, resultId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const resultIdNum = parsePositiveIntParam(resultId);
  if (mosqueId === null || resultIdNum === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { published?: unknown };
  if (typeof body.published !== "boolean") return Response.json({ error: "published مطلوب (true/false)" }, { status: 400 });

  const outcome = await setResultPublished(mosqueId, resultIdNum, body.published);
  if (!outcome) return Response.json({ error: "النتيجة غير موجودة" }, { status: 404 });

  notifyExamPublished(outcome.firstPublish, outcome.result);
  return Response.json({ result: outcome.result });
}
