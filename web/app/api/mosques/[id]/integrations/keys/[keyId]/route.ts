import { logSecurityEvent } from "@/lib/audit-log";
import { logServerError } from "@/lib/dev-error-log";
import { revokeApiKey } from "@/lib/api-keys-db";
import { idParam, integrationsGate, integrationsWriteGuard } from "@/lib/integrations-api";
import { paramNotFound } from "@/lib/mosque/api-gate";

/** سحب مفتاح (لا حذف: يبقى للتدقيق ويتوقف فوراً عن العمل) */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; keyId: string }> }) {
  const { id, keyId } = await params;
  const ctx = await integrationsGate(id);
  if (ctx instanceof Response) return ctx;
  const keyIdNum = idParam(keyId);
  if (keyIdNum instanceof Response) return keyIdNum;

  try {
    const guard = await integrationsWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;
    if (!(await revokeApiKey(ctx.mosqueId, keyIdNum))) return paramNotFound();
    await logSecurityEvent({ event: "api_key.revoke", actorKind: "mosque_admin", details: { mosqueId: ctx.mosqueId, keyId: keyIdNum } });
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("mosque-integrations:key-revoke", error);
    throw error;
  }
}
