import { canAccessMosque } from "@/lib/mosque/access";
import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { deleteActivityMedia, getActivityPhoto, isFeatureEnabled } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; activityId: string; mediaId: string }> };

function parseIds(p: { id: string; activityId: string; mediaId: string }): [number, number, number] | null {
  const ids = [p.id, p.activityId, p.mediaId].map(parsePositiveIntParam);
  return ids.some((v) => v === null) ? null : (ids as [number, number, number]);
}

/**
 * بايتات الصورة بنوعها المخزَّن. الوصول لمن يملك صلاحية هذا الجامع فقط،
 * وأي غير ذلك (بلا صلاحية، ميزة معطّلة، صورة ليست من هذا الجامع) = 404 بلا تمييز.
 */
export async function GET(_request: Request, { params }: RouteContext) {
  const ids = parseIds(await params);
  if (!ids) return paramNotFound();
  const [mosqueId, activityId, mediaId] = ids;
  if (!(await canAccessMosque(mosqueId))) return paramNotFound();
  if (!(await isFeatureEnabled(mosqueId, "archive"))) return paramNotFound();

  const photo = await getActivityPhoto(mosqueId, activityId, mediaId);
  if (!photo) return paramNotFound();

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(photo.data.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** حذف صورة أو رابط فيديو */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const ids = parseIds(await params);
  if (!ids) return paramNotFound();
  const [mosqueId, activityId, mediaId] = ids;
  const gate = await featureGate(mosqueId, "archive");
  if (gate) return gate;

  if (!(await deleteActivityMedia(mosqueId, activityId, mediaId))) {
    return Response.json({ error: "الملف غير موجود" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
