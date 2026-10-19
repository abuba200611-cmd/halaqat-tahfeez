import { getMosque } from "@/lib/mosque/db";
import { logServerError } from "@/lib/dev-error-log";
import { getFeeForMosque, listPaymentsForFee } from "@/lib/fees-db";
import { feesGate, idParam } from "@/lib/fees-api";

/** مستحق واحد مع دفعاته واسم الجامع — لصفحة الإيصال. المستحق يُجلب بمعرّفه وجامع المسار معاً. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; feeId: string }> }) {
  const { id, feeId: rawFeeId } = await params;
  const ctx = await feesGate(id);
  if (ctx instanceof Response) return ctx;
  const feeId = idParam(rawFeeId);
  if (feeId instanceof Response) return feeId;

  try {
    const fee = await getFeeForMosque(ctx.mosqueId, feeId);
    if (!fee) return Response.json({ error: "المستحق غير موجود" }, { status: 404 });
    const [payments, mosque] = await Promise.all([listPaymentsForFee(fee.id), getMosque(ctx.mosqueId)]);
    return Response.json({ fee, payments, mosqueName: mosque?.name ?? "" });
  } catch (error) {
    await logServerError("mosque-fees:detail", error);
    throw error;
  }
}
