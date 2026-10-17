import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { getTeacherEvalConfig, setTeacherEvalConfig } from "@/lib/teacher-eval-db";
import { parseTeacherEvalConfigBody, TEACHER_EVAL_FEATURE_KEY } from "@/lib/teacher-eval";
import { logServerError } from "@/lib/dev-error-log";

/* A3 — إعدادات التقييم والحوافز: المعايير والأوزان والعتبات ومعيار الإنتاجية والمبالغ. */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, TEACHER_EVAL_FEATURE_KEY);
  if (gate) return gate;

  return Response.json({ config: await getTeacherEvalConfig(mosqueId) });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, TEACHER_EVAL_FEATURE_KEY);
  if (gate) return gate;

  const parsed = parseTeacherEvalConfigBody(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    await setTeacherEvalConfig(mosqueId, parsed.config);
    return Response.json({ ok: true, config: parsed.config });
  } catch (error) {
    await logServerError("mosque-teacher-eval-settings:put", error);
    throw error;
  }
}
