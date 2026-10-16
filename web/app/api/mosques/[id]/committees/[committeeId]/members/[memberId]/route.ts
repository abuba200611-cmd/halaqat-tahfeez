import { featureGate, isMemberKind, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { removeCommitteeMember } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; committeeId: string; memberId: string }> };

/** إزالة عضو من لجنة — النوع بمعامل kind (student|member) */
export async function DELETE(request: Request, { params }: RouteContext) {
  const { id, committeeId, memberId } = await params;
  const mosqueId = Number(id);
  if ([id, committeeId, memberId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  const kind = new URL(request.url).searchParams.get("kind");
  if (!isMemberKind(kind)) {
    return Response.json({ error: "نوع العضو يجب أن يكون student أو member" }, { status: 400 });
  }

  const removed = await removeCommitteeMember(mosqueId, Number(committeeId), kind, Number(memberId));
  if (!removed) return Response.json({ error: "العضو ليس بهذه اللجنة" }, { status: 404 });
  return Response.json({ ok: true });
}
