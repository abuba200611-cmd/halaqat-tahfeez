import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { getPermitsConfig, setPermitsConfig } from "@/lib/permits-db";
import { parsePermitsConfigBody, PERMITS_FEATURE_KEY } from "@/lib/permits";
import { logServerError } from "@/lib/dev-error-log";

/* A3 — إعدادات التصاريح للجامع: كل رقم قابل للضبط، وتُدمج فوق الافتراضيات دائماً. */

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, PERMITS_FEATURE_KEY);
  if (gate) return gate;

  return Response.json({ config: await getPermitsConfig(mosqueId) });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, PERMITS_FEATURE_KEY);
  if (gate) return gate;

  const parsed = parsePermitsConfigBody(await request.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    await setPermitsConfig(mosqueId, parsed.config);
    return Response.json({ ok: true, config: parsed.config });
  } catch (error) {
    await logServerError("mosque-permits-settings:put", error);
    throw error;
  }
}
