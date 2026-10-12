import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { deleteActivity, getActivity, listActivityMedia } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; activityId: string }> };

/** نشاط واحد مع قائمة وسائطه (بلا بايتات الصور) */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id, activityId } = await params;
  if ([id, activityId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const mosqueId = Number(id);
  const gate = await featureGate(mosqueId, "archive");
  if (gate) return gate;

  const activity = await getActivity(mosqueId, Number(activityId));
  if (!activity) return Response.json({ error: "النشاط غير موجود" }, { status: 404 });
  return Response.json({ activity, media: await listActivityMedia(mosqueId, activity.id) });
}

/** حذف النشاط يزيل صوره وروابطه معه */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, activityId } = await params;
  if ([id, activityId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const mosqueId = Number(id);
  const gate = await featureGate(mosqueId, "archive");
  if (gate) return gate;

  if (!(await deleteActivity(mosqueId, Number(activityId)))) {
    return Response.json({ error: "النشاط غير موجود" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
