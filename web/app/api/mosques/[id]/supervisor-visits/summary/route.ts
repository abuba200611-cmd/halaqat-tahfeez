import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { logServerError } from "@/lib/dev-error-log";
import { SUPERVISOR_VISITS_FEATURE_KEY } from "@/lib/supervisor-visits";
import { halaqahVisitAverages } from "@/lib/supervisor-visits-db";

/*
  B4 — متوسط درجات الزيارات المنجزة لكل حلقة خلال آخر ٩٠ يوماً — بطاقة
  لوحة الجامع/التقرير. القراءة فقط ولا تكشف تفاصيل زيارة بعينها.
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, SUPERVISOR_VISITS_FEATURE_KEY);
  if (gate) return gate;

  try {
    const halaqat = await halaqahVisitAverages(mosqueId, 90);
    const withScore = halaqat.filter((h) => h.avgScore !== null);
    return Response.json({
      halaqat,
      overall: withScore.length > 0 ? Math.round(withScore.reduce((s, h) => s + (h.avgScore ?? 0), 0) / withScore.length) : null,
    });
  } catch (error) {
    await logServerError("mosque-visit-averages:get", error);
    throw error;
  }
}
