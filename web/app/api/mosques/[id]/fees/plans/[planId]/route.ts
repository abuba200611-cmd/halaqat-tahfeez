import { logServerError } from "@/lib/dev-error-log";
import { parsePlanBody } from "@/lib/fees";
import { updatePlan } from "@/lib/fees-db";
import { feesGate, feesWriteGuard, idParam } from "@/lib/fees-api";

/**
 * تعديل خطة (اسم/مبلغ/تفعيل). الدورية لا تُعدَّل بعد الإنشاء، والمستحقات
 * المولَّدة تحتفظ بمبلغها وقت التوليد. الخطة تُقيَّد بجامع المسار.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId: rawPlanId } = await params;
  const ctx = await feesGate(id);
  if (ctx instanceof Response) return ctx;
  const planId = idParam(rawPlanId);
  if (planId instanceof Response) return planId;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if ("period" in body) return Response.json({ error: "لا تُعدَّل دورية الخطة بعد إنشائها" }, { status: 400 });
    const parsed = parsePlanBody(body, true);
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    const guard = await feesWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;

    const plan = await updatePlan(ctx.mosqueId, planId, {
      name: parsed.value.name,
      amountCents: parsed.value.amountCents,
      active: parsed.value.active,
    });
    if (!plan) return Response.json({ error: "الخطة غير موجودة" }, { status: 404 });
    return Response.json({ ok: true, plan });
  } catch (error) {
    await logServerError("mosque-fees:plan-update", error);
    throw error;
  }
}
