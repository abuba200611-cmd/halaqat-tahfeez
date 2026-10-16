import { featureGate, parseIntIn, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import { parseErrorRulesInput } from "@/lib/mosque/exams";
import { createExamType, getExamConfig } from "@/lib/mosque/exams-db";

/** نوع اختبار جديد — الاسم واجب وعدد الأجزاء ١–٣٠ والدروجات ضمن سقف الإعدادات */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const config = await getExamConfig(mosqueId);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = text(body.name, 100);
  if (!name) return Response.json({ error: "اسم النوع مطلوب" }, { status: 400 });

  const juzCount = parseIntIn(body.juzCount ?? 1, 1, 30);
  const maxScore = parseIntIn(body.maxScore ?? config.maxScore, 1, config.maxScoreCap);
  const passMark = parseIntIn(body.passMark ?? config.passMark, 1, config.maxScoreCap);
  if (Number.isNaN(juzCount) || Number.isNaN(maxScore) || Number.isNaN(passMark)) {
    return Response.json(
      { error: `الأجزاء ١–٣٠، والدروجات أعداد صحيحة حتى ${config.maxScoreCap}` },
      { status: 400 },
    );
  }
  if (passMark > maxScore) return Response.json({ error: "درجة النجاح لا تتجاوز الدرجة العظمى" }, { status: 400 });

  const errorRules = parseErrorRulesInput(body.errorRules ?? {}, config.maxScoreCap);
  if (errorRules === null) return Response.json({ error: "قواعد الخصم غير صحيحة" }, { status: 400 });

  const type = await createExamType(mosqueId, { name, juzCount, maxScore, passMark, errorRules });
  if (!type) return Response.json({ error: "يوجد نوع بهذا الاسم أصلاً" }, { status: 409 });
  return Response.json({ type }, { status: 201 });
}
