import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { parseSlotBody } from "@/lib/mosque/schedule";
import { checkScheduleRef, deleteScheduleSlot, updateScheduleSlot } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; slotId: string }> };

/** تعديل خانة (استبدال كامل لحقولها) — نفس مدقق الإضافة */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id, slotId } = await params;
  const mosqueId = Number(id);
  if ([id, slotId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "weekly_schedule");
  if (gate) return gate;

  const { slot, error } = parseSlotBody(await request.json().catch(() => ({})));
  if (!slot) return Response.json({ error }, { status: 400 });

  const refError = await checkScheduleRef(mosqueId, slot);
  if (refError) return Response.json({ error: refError }, { status: 400 });

  const updated = await updateScheduleSlot(mosqueId, Number(slotId), slot);
  if (!updated) return Response.json({ error: "الخانة غير موجودة" }, { status: 404 });
  return Response.json({ slot: updated });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, slotId } = await params;
  const mosqueId = Number(id);
  if ([id, slotId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "weekly_schedule");
  if (gate) return gate;

  const deleted = await deleteScheduleSlot(mosqueId, Number(slotId));
  if (!deleted) return Response.json({ error: "الخانة غير موجودة" }, { status: 404 });
  return Response.json({ ok: true });
}
