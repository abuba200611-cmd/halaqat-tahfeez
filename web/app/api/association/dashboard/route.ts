import { requireAssociationAdmin } from "@/lib/association-gate";
import { getAssociation, getAssociationKpis } from "@/lib/association-db";
import { consolidate, parseAssociationPeriod } from "@/lib/association";
import { hijriMonthRange } from "@/lib/mosque/report-periods";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { associationCharts } from "@/lib/dashboard-charts-db";
import { logServerError } from "@/lib/dev-error-log";

/*
  A3 — لوحة الجمعية (قراءة فقط): مؤشرات كل جوامع الجمعية للفترة وإجماليها،
  ورسوم الاتجاه ضمن الفترة نفسها (مواصفة 003، حقول إضافية).
  معرّف الجمعية يأتي من الجلسة حصراً — لا يقبل المسار معرّف جمعية من العميل.
*/
export async function GET(request: Request) {
  const auth = await requireAssociationAdmin();
  if ("response" in auth) return auth.response;

  const period = parseAssociationPeriod(new URL(request.url).searchParams, hijriMonthRange(new Date()));
  if (!period.ok) return Response.json({ error: period.error }, { status: 400 });

  try {
    const [association, rows, charts] = await Promise.all([
      getAssociation(auth.admin.associationId),
      getAssociationKpis(auth.admin.associationId, period, riyadhTodayISO()),
      associationCharts(auth.admin.associationId, period),
    ]);
    return Response.json({
      association: association ? { id: association.id, name: association.name, city: association.city } : null,
      period: { from: period.from, to: period.to },
      mosques: rows,
      totals: consolidate(rows),
      charts,
    });
  } catch (error) {
    await logServerError("association-dashboard:get", error);
    throw error;
  }
}
