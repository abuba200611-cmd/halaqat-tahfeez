import { devConsoleGate } from "@/lib/dev-gate";
import { devOverview } from "@/lib/dev-db";

/** نظرة عامة: عدّادات المنصة + حجم القاعدة + آخر نشر */
export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;
  return Response.json(await devOverview());
}
