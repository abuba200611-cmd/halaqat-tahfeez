import { featureGate, parseIntIn, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { createCriterion, listCriteria } from "@/lib/mosque/db";

const FEATURE = "weekly_evaluation";

/** معايير التقييم التي حدّدها الجامع (الفعّال وغير الفعّال) */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  return Response.json({ criteria: await listCriteria(mosqueId) });
}

/** معيار جديد: الاسم واجب والدرجة العظمى 1..100 (الافتراضي 10) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { name?: unknown; maxScore?: unknown };
  const name = text(body.name, 100);
  if (!name) return Response.json({ error: "اسم المعيار مطلوب" }, { status: 400 });
  const maxScore = body.maxScore === undefined ? 10 : parseIntIn(body.maxScore, 1, 100);
  if (Number.isNaN(maxScore)) {
    return Response.json({ error: "الدرجة العظمى يجب أن تكون عدداً صحيحاً بين 1 و100" }, { status: 400 });
  }

  const criterion = await createCriterion(mosqueId, { name, maxScore });
  if (!criterion) return Response.json({ error: "يوجد معيار بهذا الاسم" }, { status: 409 });
  return Response.json({ criterion }, { status: 201 });
}
