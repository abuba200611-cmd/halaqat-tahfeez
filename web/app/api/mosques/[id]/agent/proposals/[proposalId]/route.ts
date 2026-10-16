import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { claimAgentProposal, finishAgentProposal, getAgentProposal, setAgentProposalStatus } from "@/lib/agent/store";
import { executeAgentProposal } from "@/lib/agent/execute";
import { proposalDto } from "@/lib/agent/dto";

/*
  حسم مقترح — الإنسان فقط ينفّذ: «نفّذ» يعيد التحقق الكامل وينفّذ عبر دوال
  النطاق نفسها ثم يرفع الحالة approved، و«إلغاء» يرفضها. الحسم ذرّي من
  pending فقط، وبنطاق الجامع من الجلسة — جامع آخر لا يرى هذا المقترح أصلاً.
*/

type RouteContext = { params: Promise<{ id: string; proposalId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { id, proposalId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  if (mosqueId === null || parsePositiveIntParam(proposalId) === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "agent");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "execute" && body.action !== "cancel") {
    return Response.json({ error: "action يجب أن يكون execute أو cancel" }, { status: 400 });
  }

  const proposal = await getAgentProposal(mosqueId, Number(proposalId));
  if (!proposal) return Response.json({ error: "المقترح غير موجود" }, { status: 404 });
  if (proposal.status !== "pending") {
    return Response.json({ error: "هذا المقترح محسوم سابقاً" }, { status: 409 });
  }

  if (body.action === "cancel") {
    const rejected = await setAgentProposalStatus(mosqueId, proposal.id, "rejected");
    if (!rejected) return Response.json({ error: "هذا المقترح محسوم سابقاً" }, { status: 409 });
    return Response.json({ proposal: proposalDto(rejected), message: "أُلغي المقترح" });
  }

  // حجز ذرّي قبل التنفيذ: pending → executing لطلب واحد فقط، والخاسر 409
  const claimed = await claimAgentProposal(mosqueId, proposal.id);
  if (!claimed) return Response.json({ error: "هذا المقترح محسوم سابقاً" }, { status: 409 });

  let execution: Awaited<ReturnType<typeof executeAgentProposal>>;
  try {
    execution = await executeAgentProposal(mosqueId, claimed.kind, claimed.payload);
  } catch (error) {
    await finishAgentProposal(mosqueId, claimed.id, "failed");
    throw error;
  }
  const decided = await finishAgentProposal(mosqueId, claimed.id, execution.ok ? "approved" : "failed");
  if (!decided) return Response.json({ error: "هذا المقترح محسوم سابقاً" }, { status: 409 });

  return Response.json({
    proposal: proposalDto(decided),
    message: execution.ok ? execution.message : null,
    error: execution.ok ? null : execution.error,
  });
}
