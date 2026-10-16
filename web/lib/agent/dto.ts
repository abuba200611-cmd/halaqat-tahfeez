import "server-only";

import { describeProposal } from "./tools";
import type { AgentProposal } from "./store";

/** المقترح كما تراه الواجهة — بلا حمولة خام، بعنوان وملخص عربيين */
export function proposalDto(proposal: AgentProposal) {
  const described = describeProposal(proposal.kind, proposal.payload);
  return {
    id: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    title: described.title,
    summary: described.summary,
    createdAt: proposal.createdAt,
    decidedAt: proposal.decidedAt,
  };
}

export type AgentProposalDto = ReturnType<typeof proposalDto>;
