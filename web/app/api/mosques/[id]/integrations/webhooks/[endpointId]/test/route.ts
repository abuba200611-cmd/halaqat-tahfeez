import { logServerError } from "@/lib/dev-error-log";
import { idParam, integrationsGate, integrationsWriteGuard } from "@/lib/integrations-api";
import { paramNotFound } from "@/lib/mosque/api-gate";
import { deliverDueWebhooks, endpointBelongsToMosque, enqueueWebhookEvent } from "@/lib/webhooks-db";

/** يصفّ حدث ping لهذه النقطة ويحاول تسليمه فوراً ليرى المدير النتيجة */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; endpointId: string }> }) {
  const { id, endpointId } = await params;
  const ctx = await integrationsGate(id);
  if (ctx instanceof Response) return ctx;
  const endpoint = idParam(endpointId);
  if (endpoint instanceof Response) return endpoint;

  try {
    const guard = await integrationsWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;
    if (!(await endpointBelongsToMosque(ctx.mosqueId, endpoint))) return paramNotFound();

    const queued = await enqueueWebhookEvent(ctx.mosqueId, "ping", { message: "hello from salam" }, endpoint);
    if (queued.length === 0) {
      return Response.json({ error: "النقطة موقوفة أو لا تشترك بحدث ping" }, { status: 409 });
    }
    const summary = await deliverDueWebhooks({ limit: 5, mosqueId: ctx.mosqueId });
    return Response.json({ ok: true, summary });
  } catch (error) {
    await logServerError("mosque-integrations:webhook-test", error);
    throw error;
  }
}
