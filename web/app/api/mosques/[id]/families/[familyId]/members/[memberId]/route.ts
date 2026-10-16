import { featureGate, isMemberKind, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { removeFamilyMember } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; familyId: string; memberId: string }> };

/** إزالة فرد من أسرة — النوع بمعامل kind (student|member) */
export async function DELETE(request: Request, { params }: RouteContext) {
  const { id, familyId, memberId } = await params;
  const mosqueId = Number(id);
  if ([id, familyId, memberId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "families");
  if (gate) return gate;

  const kind = new URL(request.url).searchParams.get("kind");
  if (!isMemberKind(kind)) {
    return Response.json({ error: "نوع الفرد يجب أن يكون student أو member" }, { status: 400 });
  }

  const removed = await removeFamilyMember(mosqueId, Number(familyId), kind, Number(memberId));
  if (!removed) return Response.json({ error: "الفرد ليس بهذه الأسرة" }, { status: 404 });
  return Response.json({ ok: true });
}
