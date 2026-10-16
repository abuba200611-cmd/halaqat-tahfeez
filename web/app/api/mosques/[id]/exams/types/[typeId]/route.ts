import { featureGate, parseIntIn, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import { parseErrorRulesInput } from "@/lib/mosque/exams";
import { deleteExamType, getExamConfig, updateExamType } from "@/lib/mosque/exams-db";

type RouteContext = { params: Promise<{ id: string; typeId: string }> };

/** تعديل نوع — الحقول المعطاة فقط */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id, typeId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const typeIdNum = parsePositiveIntParam(typeId);
  if (mosqueId === null || typeIdNum === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const config = await getExamConfig(mosqueId);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const changes: Parameters<typeof updateExamType>[2] = {};
  if (body.name !== undefined) {
    const name = text(body.name, 100);
    if (!name) return Response.json({ error: "اسم النوع مطلوب" }, { status: 400 });
    changes.name = name;
  }
  if (body.juzCount !== undefined) {
    const juzCount = parseIntIn(body.juzCount, 1, 30);
    if (Number.isNaN(juzCount)) return Response.json({ error: "الأجزاء ١–٣٠" }, { status: 400 });
    changes.juzCount = juzCount;
  }
  if (body.maxScore !== undefined) {
    const maxScore = parseIntIn(body.maxScore, 1, config.maxScoreCap);
    if (Number.isNaN(maxScore)) return Response.json({ error: "درجة غير صحيحة" }, { status: 400 });
    changes.maxScore = maxScore;
  }
  if (body.passMark !== undefined) {
    const passMark = parseIntIn(body.passMark, 1, config.maxScoreCap);
    if (Number.isNaN(passMark)) return Response.json({ error: "درجة غير صحيحة" }, { status: 400 });
    changes.passMark = passMark;
  }
  if (body.errorRules !== undefined) {
    const errorRules = parseErrorRulesInput(body.errorRules, config.maxScoreCap);
    if (errorRules === null) return Response.json({ error: "قواعد الخصم غير صحيحة" }, { status: 400 });
    changes.errorRules = errorRules;
  }
  if (body.active !== undefined) changes.active = body.active === true;
  if (Object.keys(changes).length === 0) return Response.json({ error: "لا تغييرات" }, { status: 400 });

  const type = await updateExamType(mosqueId, typeIdNum, changes);
  if (type === "conflict") return Response.json({ error: "يوجد نوع بهذا الاسم أصلاً" }, { status: 409 });
  if (!type) return Response.json({ error: "النوع غير موجود" }, { status: 404 });
  if (type.passMark > type.maxScore) {
    return Response.json({ error: "درجة النجاح لا تتجاوز الدرجة العظمى" }, { status: 400 });
  }
  return Response.json({ type });
}

/** حذف النوع يحذف ترشيحاته ونتائجه معه (تسلسل بالقاعدة) */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, typeId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const typeIdNum = parsePositiveIntParam(typeId);
  if (mosqueId === null || typeIdNum === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const deleted = await deleteExamType(mosqueId, typeIdNum);
  if (!deleted) return Response.json({ error: "النوع غير موجود" }, { status: 404 });
  return Response.json({ ok: true });
}
