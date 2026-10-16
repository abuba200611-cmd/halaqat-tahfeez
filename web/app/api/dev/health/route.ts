import { devConsoleGate } from "@/lib/dev-gate";
import { devHealth } from "@/lib/dev-db";
import { listRecentServerErrors } from "@/lib/dev-error-log";

/** صحة النظام: آخر أخطاء الخادم + مفاتيح الحدود الأكثر استهلاكاً اليوم + أحجام الجداول */
export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const [health, errors] = await Promise.all([devHealth(), listRecentServerErrors(100)]);
  return Response.json({ ...health, errors });
}
