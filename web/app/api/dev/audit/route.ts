import { devConsoleGate } from "@/lib/dev-gate";
import { listDevAudit } from "@/lib/dev-audit";

/** آخر ٢٠٠ إجراء من سجل التدقيق — الأحدث أولاً */
export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;
  return Response.json({ entries: await listDevAudit(200) });
}
