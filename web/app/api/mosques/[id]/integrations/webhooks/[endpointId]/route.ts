import { logServerError } from "@/lib/dev-error-log";
import { idParam, integrationsGate, integrationsWriteGuard } from "@/lib/integrations-api";
import { paramNotFound } from "@/lib/mosque/api-gate";
import { deleteEndpoint, setEndpointActive } from "@/lib/webhooks-db";

type Ctx = { params: Promise<{ id: string; endpointId: string }> };

/** تفعيل/إيقاف نقطة: { active: boolean } */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id, endpointId } = await params;
  const ctx = await integrationsGate(id);
  if (ctx instanceof Response) return ctx;
  const endpoint = idParam(endpointId);
  if (endpoint instanceof Response) return endpoint;

  try {
    const body = (await request.json().catch(() => ({}))) as { active?: unknown };
    if (typeof body.active !== "boolean") return Response.json({ error: "active مطلوب" }, { status: 400 });
    const guard = await integrationsWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;
    if (!(await setEndpointActive(ctx.mosqueId, endpoint, body.active))) return paramNotFound();
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("mosque-integrations:webhook-toggle", error);
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id, endpointId } = await params;
  const ctx = await integrationsGate(id);
  if (ctx instanceof Response) return ctx;
  const endpoint = idParam(endpointId);
  if (endpoint instanceof Response) return endpoint;

  try {
    const guard = await integrationsWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;
    if (!(await deleteEndpoint(ctx.mosqueId, endpoint))) return paramNotFound();
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("mosque-integrations:webhook-delete", error);
    throw error;
  }
}
