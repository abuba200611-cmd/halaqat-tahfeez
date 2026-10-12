import { featureGate, isTaskStatus, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { deleteCommitteeTask, setCommitteeTaskStatus } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; committeeId: string; taskId: string }> };

/** تغيير حالة مهمة: todo | doing | done */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id, committeeId, taskId } = await params;
  const mosqueId = Number(id);
  if ([id, committeeId, taskId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { status?: unknown };
  if (!isTaskStatus(body.status)) {
    return Response.json({ error: "الحالة يجب أن تكون todo أو doing أو done" }, { status: 400 });
  }

  const task = await setCommitteeTaskStatus(mosqueId, Number(committeeId), Number(taskId), body.status);
  if (!task) return Response.json({ error: "المهمة غير موجودة" }, { status: 404 });
  return Response.json({ task });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, committeeId, taskId } = await params;
  const mosqueId = Number(id);
  if ([id, committeeId, taskId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  const deleted = await deleteCommitteeTask(mosqueId, Number(committeeId), Number(taskId));
  if (!deleted) return Response.json({ error: "المهمة غير موجودة" }, { status: 404 });
  return Response.json({ ok: true });
}
