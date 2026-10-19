import { logServerError } from "@/lib/dev-error-log";
import { parsePlanBody } from "@/lib/fees";
import { createPlan } from "@/lib/fees-db";
import { feesGate, feesWriteGuard } from "@/lib/fees-api";

/** إنشاء خطة رسوم: { name, amount, period } — المبلغ نصّ/رقم عشري بمنزلتين كحد أقصى */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await feesGate((await params).id);
  if (ctx instanceof Response) return ctx;

  try {
    const parsed = parsePlanBody(await request.json().catch(() => ({})));
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    const guard = await feesWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;

    const { name, amountCents, period } = parsed.value;
    const plan = await createPlan(ctx.mosqueId, {
      name: name as string,
      amountCents: amountCents as number,
      period: period as NonNullable<typeof period>,
    });
    return Response.json({ ok: true, plan });
  } catch (error) {
    await logServerError("mosque-fees:plan-create", error);
    throw error;
  }
}
