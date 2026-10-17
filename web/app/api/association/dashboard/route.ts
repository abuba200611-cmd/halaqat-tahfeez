import { requireAssociationAdmin } from "@/lib/association-gate";
import { getAssociation, getAssociationKpis } from "@/lib/association-db";
import { consolidate, parseAssociationPeriod } from "@/lib/association";
import { hijriMonthRange } from "@/lib/mosque/report-periods";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { logServerError } from "@/lib/dev-error-log";

/*
  A3 — لوحة الجمعية (قراءة فقط): مؤشرات كل جوامع الجمعية للفترة وإجماليها.
  معرّف الجمعية يأتي من الجلسة حصراً — لا يقبل المسار معرّف جمعية من العميل.
*/
export async function GET(request: Request) {
  const auth = await requireAssociationAdmin();
  if ("response" in auth) return auth.response;

  const period = parseAssociationPeriod(new URL(request.url).searchParams, hijriMonthRange(new Date()));
  if (!period.ok) return Response.json({ error: period.error }, { status: 400 });

  try {
    const [association, rows] = await Promise.all([
      getAssociation(auth.admin.associationId),
      getAssociationKpis(auth.admin.associationId, period, riyadhTodayISO()),
    ]);
    return Response.json({
      association: association ? { id: association.id, name: association.name, city: association.city } : null,
      period: { from: period.from, to: period.to },
      mosques: rows,
      totals: consolidate(rows),
    });
  } catch (error) {
    await logServerError("association-dashboard:get", error);
    throw error;
  }
}
