import { logServerError } from "@/lib/dev-error-log";
import { API_SCOPES, SCOPE_LABELS } from "@/lib/api-keys";
import { listApiKeys } from "@/lib/api-keys-db";
import { CONNECTORS } from "@/lib/connectors";
import { integrationsGate } from "@/lib/integrations-api";
import { WEBHOOK_EVENTS } from "@/lib/webhooks";
import { listEndpoints } from "@/lib/webhooks-db";

/** نظرة عامة على التكاملات: المفاتيح (بلا أسرار) والنقاط والموصّلات */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await integrationsGate((await params).id);
  if (ctx instanceof Response) return ctx;
  try {
    const [keys, endpoints] = await Promise.all([listApiKeys(ctx.mosqueId), listEndpoints(ctx.mosqueId)]);
    return Response.json(
      {
        keys,
        endpoints,
        scopes: API_SCOPES.map((key) => ({ key, label: SCOPE_LABELS[key] })),
        events: WEBHOOK_EVENTS,
        connectors: CONNECTORS,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    await logServerError("mosque-integrations:overview", error);
    throw error;
  }
}
