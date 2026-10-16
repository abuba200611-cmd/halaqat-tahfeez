import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque, getMosqueFeatures, setMosqueFeature } from "@/lib/mosque/db";
import { getFeature } from "@/lib/mosque/features";
import { logDevAction } from "@/lib/dev-audit";

/** مزايا الجامع كما هي فعلياً — السجل مدموجاً مع تجاوزات هذا الجامع */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  return Response.json({ features: await getMosqueFeatures(mosqueId) });
}

/** تفعيل/تعطيل ميزة واحدة لهذا الجامع — المفاتيح غير المعروفة و"قريباً" تُرفض */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { key?: unknown; enabled?: unknown };
  const feature = getFeature(String(body.key ?? ""));
  if (!feature) return Response.json({ error: "ميزة غير معروفة" }, { status: 400 });
  if (feature.status !== "ready") {
    return Response.json({ error: "هذه الميزة قريباً — لا يمكن تفعيلها الآن" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "قيمة enabled يجب أن تكون true/false" }, { status: 400 });
  }

  await setMosqueFeature(mosqueId, feature.key, body.enabled);
  await logDevAction("feature_toggle", "mosque", mosqueId, { key: feature.key, enabled: body.enabled });
  return Response.json({ features: await getMosqueFeatures(mosqueId) });
}
