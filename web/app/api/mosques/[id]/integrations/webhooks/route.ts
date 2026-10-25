import { logServerError } from "@/lib/dev-error-log";
import { integrationsGate, integrationsWriteGuard } from "@/lib/integrations-api";
import { UnsafeUrlError, assertSafeWebhookUrl, isWebhookEvent } from "@/lib/webhooks";
import { MAX_ENDPOINTS, countEndpoints, createEndpoint } from "@/lib/webhooks-db";

/** إنشاء نقطة ويب هوك: { url, events[] } — السرّ يُعاد هنا مرة واحدة فقط */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await integrationsGate((await params).id);
  if (ctx instanceof Response) return ctx;

  try {
    const body = (await request.json().catch(() => ({}))) as { url?: unknown; events?: unknown };
    const url = typeof body.url === "string" ? body.url.trim().slice(0, 500) : "";
    const events = Array.isArray(body.events) ? [...new Set(body.events)] : [];
    if (!events.every(isWebhookEvent)) return Response.json({ error: "حدث غير معروف" }, { status: 400 });

    try {
      await assertSafeWebhookUrl(url);
    } catch (error) {
      if (error instanceof UnsafeUrlError) return Response.json({ error: error.message }, { status: 400 });
      throw error;
    }

    const guard = await integrationsWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;

    if ((await countEndpoints(ctx.mosqueId)) >= MAX_ENDPOINTS) {
      return Response.json({ error: `الحدّ الأقصى ${MAX_ENDPOINTS} نقاط` }, { status: 409 });
    }
    // قائمة أحداث فارغة = كل الأحداث
    const created = await createEndpoint(ctx.mosqueId, url, events as string[]);
    return Response.json({ ok: true, id: created.id, secret: created.secret }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await logServerError("mosque-integrations:webhook-create", error);
    throw error;
  }
}
