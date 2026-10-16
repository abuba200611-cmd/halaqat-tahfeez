import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { getAgentProvider } from "@/lib/agent/provider";
import { listRecentAgentProposals } from "@/lib/agent/store";
import { proposalDto } from "@/lib/agent/dto";

/*
  حالة المساعد لجامع: هل المزوّد مضبوط (المفتاح موجود؟) وأحدث المقترحات
  لعرضها كبطاقات عند فتح المحادثة. المفتاح الغائب ليس خطأ — available=false
  تعرض الواجهة بها «المساعد غير مفعّل بعد».
*/

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "agent");
  if (gate) return gate;

  const proposals = await listRecentAgentProposals(mosqueId, 10);
  return Response.json({ available: getAgentProvider() !== null, proposals: proposals.map(proposalDto) });
}
