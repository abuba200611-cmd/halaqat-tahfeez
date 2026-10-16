import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  حسم المقترحات — الإنسان فقط: «إلغاء» يرفض بلا تنفيذ، و«نفّذ» يمرّ
  بالمنفّذ بنفس جامع الجلسة ثم يرفع الحالة. المقترح المحسوم لا يعاد
  حسمه (409)، ومقترح جامع آخر غير موجود أصلاً (404).
*/

const mocks = vi.hoisted(() => ({
  canAccessMosque: vi.fn(),
  isFeatureEnabled: vi.fn(),
  getMosque: vi.fn(),
  getAgentProposal: vi.fn(),
  setAgentProposalStatus: vi.fn(),
  executeAgentProposal: vi.fn(),
  proposalDto: vi.fn(),
}));

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: mocks.canAccessMosque }));
vi.mock("@/lib/mosque/admin-auth", () => ({
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
}));
vi.mock("@/lib/mosque/db", () => ({ isFeatureEnabled: mocks.isFeatureEnabled, getMosque: mocks.getMosque }));
vi.mock("@/lib/agent/store", () => ({
  getAgentProposal: mocks.getAgentProposal,
  setAgentProposalStatus: mocks.setAgentProposalStatus,
}));
vi.mock("@/lib/agent/execute", () => ({ executeAgentProposal: mocks.executeAgentProposal }));
vi.mock("@/lib/agent/dto", () => ({ proposalDto: mocks.proposalDto }));

const { POST } = await import("@/app/api/mosques/[id]/agent/proposals/[proposalId]/route");

const CONTEXT = { params: Promise.resolve({ id: "7", proposalId: "12" }) };

function request(body: unknown) {
  return new Request("http://localhost/api/mosques/7/agent/proposals/12", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const pendingProposal = {
  id: 12,
  mosqueId: 7,
  userId: 3,
  kind: "create_family",
  payload: { name: "أسرة النور" },
  status: "pending" as const,
  createdAt: "",
  decidedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canAccessMosque.mockResolvedValue(true);
  mocks.isFeatureEnabled.mockResolvedValue(true);
  mocks.getMosque.mockResolvedValue({ id: 7, name: "الجامع", city: "", createdAt: "" });
  mocks.proposalDto.mockImplementation((proposal: { id: number; status: string }) => ({ id: proposal.id, status: proposal.status }));
});

describe("التحقق الأولي", () => {
  it("action غير معروف: 400", async () => {
    const res = await POST(request({ action: "force" }), CONTEXT);
    expect(res.status).toBe(400);
  });

  it("مقترح جامع آخر (أو غير موجود): 404 ولا حسم ولا تنفيذ", async () => {
    mocks.getAgentProposal.mockResolvedValue(null);
    const res = await POST(request({ action: "execute" }), CONTEXT);
    expect(res.status).toBe(404);
    expect(mocks.setAgentProposalStatus).not.toHaveBeenCalled();
    expect(mocks.executeAgentProposal).not.toHaveBeenCalled();
  });

  it("مقترح محسوم سابقاً: 409", async () => {
    mocks.getAgentProposal.mockResolvedValue({ ...pendingProposal, status: "approved" });
    const res = await POST(request({ action: "cancel" }), CONTEXT);
    expect(res.status).toBe(409);
  });
});

describe("الإنسان فقط ينفّذ", () => {
  it("«إلغاء»: رفض ذرّي بلا أي تنفيذ للحمولة", async () => {
    mocks.getAgentProposal.mockResolvedValue(pendingProposal);
    mocks.setAgentProposalStatus.mockResolvedValue({ ...pendingProposal, status: "rejected" });

    const res = await POST(request({ action: "cancel" }), CONTEXT);

    expect(res.status).toBe(200);
    expect(mocks.setAgentProposalStatus).toHaveBeenCalledWith(7, 12, "rejected");
    expect(mocks.executeAgentProposal).not.toHaveBeenCalled();
  });

  it("«نفّذ»: إعادة التحقق والتنفيذ بجامع الجلسة ثم approved", async () => {
    mocks.getAgentProposal.mockResolvedValue(pendingProposal);
    mocks.executeAgentProposal.mockResolvedValue({ ok: true, message: "أُنشئت أسرة «أسرة النور»" });
    mocks.setAgentProposalStatus.mockResolvedValue({ ...pendingProposal, status: "approved" });

    const res = await POST(request({ action: "execute" }), CONTEXT);
    const body = (await res.json()) as { proposal: { status: string }; message: string };

    expect(res.status).toBe(200);
    expect(mocks.executeAgentProposal).toHaveBeenCalledWith(7, "create_family", { name: "أسرة النور" });
    expect(mocks.setAgentProposalStatus).toHaveBeenCalledWith(7, 12, "approved");
    expect(body.proposal.status).toBe("approved");
    expect(body.message).toContain("أسرة النور");
  });

  it("تنفيذ يفشل (هدف لم يعد موجوداً): الحالة failed والسبب يصل", async () => {
    mocks.getAgentProposal.mockResolvedValue(pendingProposal);
    mocks.executeAgentProposal.mockResolvedValue({ ok: false, error: "الهدف ليس من هذا الجامع" });
    mocks.setAgentProposalStatus.mockResolvedValue({ ...pendingProposal, status: "failed" });

    const res = await POST(request({ action: "execute" }), CONTEXT);
    const body = (await res.json()) as { proposal: { status: string }; error: string };

    expect(res.status).toBe(200);
    expect(mocks.setAgentProposalStatus).toHaveBeenCalledWith(7, 12, "failed");
    expect(body.proposal.status).toBe("failed");
    expect(body.error).toContain("ليس من هذا الجامع");
  });

  it("سباق حسم مزدوج: التحديث الذرّي يرجع null → 409", async () => {
    mocks.getAgentProposal.mockResolvedValue(pendingProposal);
    mocks.executeAgentProposal.mockResolvedValue({ ok: true, message: "تم" });
    mocks.setAgentProposalStatus.mockResolvedValue(null);

    const res = await POST(request({ action: "execute" }), CONTEXT);
    expect(res.status).toBe(409);
  });
});
