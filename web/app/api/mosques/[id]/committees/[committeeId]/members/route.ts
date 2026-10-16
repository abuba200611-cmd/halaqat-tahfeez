import { featureGate, isMemberKind, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { addCommitteeMember, findMemberName, getCommittee } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; committeeId: string }> };

/** إضافة عضو للجنة بدور نصي (رئيس/عضو…) — يجب أن يكون من أفراد هذا الجامع */
export async function POST(request: Request, { params }: RouteContext) {
  const { id, committeeId } = await params;
  const mosqueId = Number(id);
  if ([id, committeeId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  const committee = await getCommittee(mosqueId, Number(committeeId));
  if (!committee) return Response.json({ error: "اللجنة غير موجودة" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    memberKind?: unknown;
    memberId?: unknown;
    role?: unknown;
  };
  if (!isMemberKind(body.memberKind)) {
    return Response.json({ error: "نوع العضو يجب أن يكون student أو member" }, { status: 400 });
  }
  const memberId = Number(body.memberId);
  if (!Number.isInteger(memberId) || memberId <= 0) {
    return Response.json({ error: "معرّف العضو غير صالح" }, { status: 400 });
  }
  if (!(await findMemberName(mosqueId, body.memberKind, memberId))) {
    return Response.json({ error: "العضو ليس من أفراد هذا الجامع" }, { status: 400 });
  }

  const added = await addCommitteeMember(
    mosqueId,
    committee.id,
    body.memberKind,
    memberId,
    text(body.role, 50),
  );
  if (!added) return Response.json({ error: "العضو باللجنة أصلاً" }, { status: 409 });

  return Response.json({ ok: true }, { status: 201 });
}
