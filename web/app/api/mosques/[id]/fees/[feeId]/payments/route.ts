import { logServerError } from "@/lib/dev-error-log";
import { parsePaymentBody } from "@/lib/fees";
import { recordPayment } from "@/lib/fees-db";
import { feesGate, feesWriteGuard, idParam } from "@/lib/fees-api";

/**
 * تسجيل دفعة: { amount, method?, note? }. المبلغ الزائد عن المتبقي والمعفى
 * والمسدّد بالكامل = 400. التحديث (amount_paid/status) بترانزاكشن واحدة.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; feeId: string }> }) {
  const { id, feeId: rawFeeId } = await params;
  const ctx = await feesGate(id);
  if (ctx instanceof Response) return ctx;
  const feeId = idParam(rawFeeId);
  if (feeId instanceof Response) return feeId;

  try {
    const parsed = parsePaymentBody(await request.json().catch(() => ({})));
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    const guard = await feesWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;

    const result = await recordPayment({
      mosqueId: ctx.mosqueId,
      feeId,
      amountCents: parsed.value.amountCents,
      method: parsed.value.method,
      note: parsed.value.note,
      actor: { kind: guard.kind, id: guard.id },
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, fee: result.fee, payment: result.payment });
  } catch (error) {
    await logServerError("mosque-fees:payment", error);
    throw error;
  }
}
