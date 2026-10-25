import { logSecurityEvent } from "@/lib/audit-log";
import { logServerError } from "@/lib/dev-error-log";
import { parseScopes } from "@/lib/api-keys";
import { MAX_ACTIVE_KEYS, countActiveApiKeys, createApiKey } from "@/lib/api-keys-db";
import { integrationsGate, integrationsWriteGuard } from "@/lib/integrations-api";
import { text } from "@/lib/mosque/api-gate";

/** إنشاء مفتاح: { name, scopes[] } — المفتاح الصريح يُعاد هنا مرة واحدة فقط */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await integrationsGate((await params).id);
  if (ctx instanceof Response) return ctx;

  try {
    const body = (await request.json().catch(() => ({}))) as { name?: unknown; scopes?: unknown };
    const name = text(body.name, 60);
    if (!name) return Response.json({ error: "اسم المفتاح مطلوب" }, { status: 400 });
    const scopes = parseScopes(body.scopes);
    if (!scopes) return Response.json({ error: "اختر نطاقاً واحداً صالحاً على الأقل" }, { status: 400 });

    const guard = await integrationsWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;

    if ((await countActiveApiKeys(ctx.mosqueId)) >= MAX_ACTIVE_KEYS) {
      return Response.json({ error: `الحدّ الأقصى ${MAX_ACTIVE_KEYS} مفاتيح فعّالة — اسحب مفتاحاً أولاً` }, { status: 409 });
    }
    const { key, plaintext } = await createApiKey(ctx.mosqueId, name, scopes);
    await logSecurityEvent({ event: "api_key.create", actorKind: "mosque_admin", details: { mosqueId: ctx.mosqueId, keyId: key.id, scopes } });
    return Response.json({ ok: true, key, plaintext }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await logServerError("mosque-integrations:key-create", error);
    throw error;
  }
}
