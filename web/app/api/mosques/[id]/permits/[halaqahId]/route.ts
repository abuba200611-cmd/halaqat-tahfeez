import { featureGate, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import { currentMosqueActor } from "@/lib/mosque/actor";
import { applyPermitActionDb } from "@/lib/permits-db";
import { isPermitAction, PERMITS_FEATURE_KEY, PERMIT_NOTES_MAX } from "@/lib/permits";
import { logServerError } from "@/lib/dev-error-log";

/*
  A3 — إجراء يدوي على تصريح حلقة: { action, notes? }. الانتقال مقيَّد بآلة
  الحالات (lib/permits.ts) ويُسجَّل في permits_log بالفاعل والحالتين.
  الحلقة تُتحقَّق ملكيتها للجامع في الطبقة السفلى (404 لحلقة جامع آخر).
*/

type RouteContext = { params: Promise<{ id: string; halaqahId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id, halaqahId: halaqahParam } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const halaqahId = parsePositiveIntParam(halaqahParam);
  if (mosqueId === null || halaqahId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, PERMITS_FEATURE_KEY);
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; notes?: unknown };
  if (!isPermitAction(body.action)) return Response.json({ error: "إجراء غير معروف" }, { status: 400 });

  try {
    const actor = await currentMosqueActor();
    const result = await applyPermitActionDb({
      mosqueId,
      halaqahId,
      action: body.action,
      actor,
      notes: body.notes === undefined ? undefined : text(body.notes, PERMIT_NOTES_MAX),
    });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, permit: result.permit });
  } catch (error) {
    await logServerError("mosque-permits:action", error);
    throw error;
  }
}
