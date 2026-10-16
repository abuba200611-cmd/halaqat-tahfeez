import { devConsoleGate } from "@/lib/dev-gate";
import { devAccountsOverview } from "@/lib/dev-db";

/** نظرة «الحسابات»: جديد بآخر ٧/٣٠ يوماً ونشط بآخر ٧ أيام لكل دور */
export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;
  return Response.json(await devAccountsOverview());
}
