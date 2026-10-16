import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { examStatsBetween } from "@/lib/mosque/exams-db";
import { isPeriodChoice, periodLabel, resolvePeriod, type ReportPeriod } from "@/lib/mosque/report-periods";

/** إحصاءات الاختبارات لفترة — نفس فترات التقارير (أسبوع/شهر هجري/مخصص) */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const url = new URL(request.url);
  const choice = url.searchParams.get("period") ?? "hijri_month";
  if (!isPeriodChoice(choice)) return Response.json({ error: "فترة غير معروفة" }, { status: 400 });

  const period: ReportPeriod | null = resolvePeriod(choice, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!period) return Response.json({ error: "نطاق التاريخ غير صحيح" }, { status: 400 });

  const stats = await examStatsBetween(mosqueId, period.from, period.to);
  return Response.json({ period, periodLabel: periodLabel(period), stats });
}
