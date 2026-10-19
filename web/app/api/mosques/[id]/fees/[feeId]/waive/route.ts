import { logServerError } from "@/lib/dev-error-log";
import { waiveFee } from "@/lib/fees-db";
import { feesGate, feesWriteGuard, idParam } from "@/lib/fees-api";

/** إعفاء مستحق (مستحق/جزئي فقط). بعد الإعفاء لا يقبل دفعات. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; feeId: string }> }) {
  const { id, feeId: rawFeeId } = await params;
  const ctx = await feesGate(id);
  if (ctx instanceof Response) return ctx;
  const feeId = idParam(rawFeeId);
  if (feeId instanceof Response) return feeId;

  try {
    const guard = await feesWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;

    const result = await waiveFee(ctx.mosqueId, feeId);
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, fee: result.fee });
  } catch (error) {
    await logServerError("mosque-fees:waive", error);
    throw error;
  }
}
