import { devConsoleGate } from "@/lib/dev-gate";
import { devOverview } from "@/lib/dev-db";
import { devCharts } from "@/lib/dashboard-charts-db";

/** نظرة عامة: عدّادات المنصة + حجم القاعدة + آخر نشر + رسوم الاتجاه (مواصفة 003، إضافي) */
export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const [overview, charts] = await Promise.all([devOverview(), devCharts()]);
  return Response.json({ ...overview, charts });
}
