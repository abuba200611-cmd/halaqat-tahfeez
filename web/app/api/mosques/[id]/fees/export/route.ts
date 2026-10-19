import { parsePositiveIntParam } from "@/lib/mosque/api-gate";
import { logServerError } from "@/lib/dev-error-log";
import { buildFeesCsv } from "@/lib/fees";
import { listFees } from "@/lib/fees-db";
import { feesGate } from "@/lib/fees-api";

/** تصدير CSV للمستحقات بنفس مرشّحات القائمة (?halaqah=&status=&period=) — جامع المسار فقط. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await feesGate((await params).id);
  if (ctx instanceof Response) return ctx;

  try {
    const query = new URL(request.url).searchParams;
    const { fees } = await listFees(ctx.mosqueId, {
      halaqahId: parsePositiveIntParam(query.get("halaqah") ?? undefined),
      status: query.get("status"),
      period: query.get("period"),
    });
    const today = new Date().toISOString().slice(0, 10);
    return new Response(buildFeesCsv(fees), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="fees-${ctx.mosqueId}-${today}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    await logServerError("mosque-fees:export", error);
    throw error;
  }
}
