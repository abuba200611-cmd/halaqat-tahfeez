import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { isPeriodChoice, resolvePeriod } from "@/lib/mosque/report-periods";
import { buildHonorBoard } from "@/lib/mosque/honor-board-data";

const PERIOD_ERROR = "period يجب أن يكون this_week أو last_week أو hijri_month أو custom";
const CUSTOM_ERROR = "النطاق المخصص يحتاج from وto تاريخين صالحين (from ≤ to)";

/** لوحة الشرف لفترة واحدة — الحساب كله في buildHonorBoard (يشاركه الإيجنت) */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "honor_board");
  if (gate) return gate;

  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "this_week";
  if (!isPeriodChoice(periodParam)) return Response.json({ error: PERIOD_ERROR }, { status: 400 });

  const period = resolvePeriod(periodParam, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!period) return Response.json({ error: CUSTOM_ERROR }, { status: 400 });

  return Response.json(await buildHonorBoard(mosqueId, period));
}
