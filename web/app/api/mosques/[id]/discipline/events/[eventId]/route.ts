import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { acknowledgeMosqueEvent } from "@/lib/discipline-db";

/*
  A2 — إقرار استلام حدث من إدارة الجامع (التنبيهات الحرجة تحديداً).
  محصور بأحداث حلقات هذا الجامع.
*/

type RouteContext = { params: Promise<{ id: string; eventId: string }> };

export async function PATCH(_request: Request, { params }: RouteContext) {
  const { id, eventId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "discipline");
  if (gate) return gate;

  const parsedEventId = parsePositiveIntParam(eventId);
  if (parsedEventId === null) return paramNotFound();

  const ok = await acknowledgeMosqueEvent(mosqueId, parsedEventId);
  if (!ok) return Response.json({ error: "غير موجود" }, { status: 404 });
  return Response.json({ ok: true });
}
