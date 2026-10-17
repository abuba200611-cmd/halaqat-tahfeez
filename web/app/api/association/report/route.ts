import { requireAssociationAdmin } from "@/lib/association-gate";
import { getAssociationKpis } from "@/lib/association-db";
import { buildAssociationCsv, consolidate, parseAssociationPeriod } from "@/lib/association";
import { hijriMonthRange } from "@/lib/mosque/report-periods";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { logServerError } from "@/lib/dev-error-log";

/*
  A3 — التقرير المجمّع للجمعية: JSON افتراضياً، و?format=csv ملف CSV
  (BOM + تحصين خلايا المعادلات). قراءة فقط ومقيّد بجوامع جمعية الجلسة.
*/
export async function GET(request: Request) {
  const auth = await requireAssociationAdmin();
  if ("response" in auth) return auth.response;

  const url = new URL(request.url);
  const period = parseAssociationPeriod(url.searchParams, hijriMonthRange(new Date()));
  if (!period.ok) return Response.json({ error: period.error }, { status: 400 });

  try {
    const rows = await getAssociationKpis(auth.admin.associationId, period, riyadhTodayISO());
    if (url.searchParams.get("format") === "csv") {
      return new Response(buildAssociationCsv(rows), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="association-report-${period.from}_${period.to}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return Response.json({ period: { from: period.from, to: period.to }, mosques: rows, totals: consolidate(rows) });
  } catch (error) {
    await logServerError("association-report:get", error);
    throw error;
  }
}
