import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { deleteCommittee, getCommittee, listCommitteeMembers, listCommitteeTasks } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; committeeId: string }> };

/** لجنة واحدة بأعضائها ومهامها — كل ما تحتاجه صفحة اللجنة */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id, committeeId } = await params;
  const mosqueId = Number(id);
  if ([id, committeeId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  const committee = await getCommittee(mosqueId, Number(committeeId));
  if (!committee) return Response.json({ error: "اللجنة غير موجودة" }, { status: 404 });

  const [members, tasks] = await Promise.all([
    listCommitteeMembers(mosqueId, committee.id),
    listCommitteeTasks(mosqueId, committee.id),
  ]);
  return Response.json({ committee, members, tasks });
}

/** حذف اللجنة يزيل أعضاءها ومهامها معها (تسلسل بالقاعدة) */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, committeeId } = await params;
  const mosqueId = Number(id);
  if ([id, committeeId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  const deleted = await deleteCommittee(mosqueId, Number(committeeId));
  if (!deleted) return Response.json({ error: "اللجنة غير موجودة" }, { status: 404 });
  return Response.json({ ok: true });
}
