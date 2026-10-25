import { devConsoleGate } from "@/lib/dev-gate";
import { listDevAudit } from "@/lib/dev-audit";

/** آخر ٢٠٠ إجراء من سجل التدقيق — الأحدث أولاً. ?scope=security لأحداث الأمان */
export async function GET(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;
  const scope = new URL(request.url).searchParams.get("scope") === "security" ? "security" : "admin";
  return Response.json({ entries: await listDevAudit(200, scope) });
}
