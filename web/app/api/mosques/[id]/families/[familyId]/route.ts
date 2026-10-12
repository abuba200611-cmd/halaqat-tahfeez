import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { deleteFamily, getFamily, listFamilyMembers } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; familyId: string }> };

/** أسرة واحدة مع أفرادها بأسمائهم */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id, familyId } = await params;
  const mosqueId = Number(id);
  if ([id, familyId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "families");
  if (gate) return gate;

  const family = await getFamily(mosqueId, Number(familyId));
  if (!family) return Response.json({ error: "الأسرة غير موجودة" }, { status: 404 });

  return Response.json({ family, members: await listFamilyMembers(mosqueId, family.id) });
}

/** حذف الأسرة يزيل أفرادها معها (تسلسل بالقاعدة) */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, familyId } = await params;
  const mosqueId = Number(id);
  if ([id, familyId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "families");
  if (gate) return gate;

  const deleted = await deleteFamily(mosqueId, Number(familyId));
  if (!deleted) return Response.json({ error: "الأسرة غير موجودة" }, { status: 404 });
  return Response.json({ ok: true });
}
