import { featureGate, isMemberKind, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { addFamilyMember, findMemberName, getFamily } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; familyId: string }> };

/** إضافة فرد لأسرة — طالب أو عضو حر، يجب أن يكون من أفراد هذا الجامع */
export async function POST(request: Request, { params }: RouteContext) {
  const { id, familyId } = await params;
  const mosqueId = Number(id);
  if ([id, familyId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "families");
  if (gate) return gate;

  const family = await getFamily(mosqueId, Number(familyId));
  if (!family) return Response.json({ error: "الأسرة غير موجودة" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    memberKind?: unknown;
    memberId?: unknown;
  };
  if (!isMemberKind(body.memberKind)) {
    return Response.json({ error: "نوع الفرد يجب أن يكون student أو member" }, { status: 400 });
  }
  const memberId = Number(body.memberId);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return Response.json({ error: "معرّف الفرد غير صالح" }, { status: 400 });
  }
  if (!(await findMemberName(mosqueId, body.memberKind, memberId))) {
    return Response.json({ error: "الفرد ليس من أفراد هذا الجامع" }, { status: 400 });
  }

  const added = await addFamilyMember(mosqueId, family.id, body.memberKind, memberId);
  if (!added) return Response.json({ error: "الفرد مضاف لهذه الأسرة أصلاً" }, { status: 409 });

  return Response.json({ ok: true }, { status: 201 });
}
