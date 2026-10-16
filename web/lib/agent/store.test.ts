import { afterEach, describe, expect, it, vi } from "vitest";

/*
  طبقة جداول الإيجنت — بالقاعدة مُحاكاة: حسم المقترحات ذرّي من pending
  وبنطاق الجامع، تقليم الذاكرة فوق ٢٠٠، حسم الدروس من pending فقط،
  والدروس المعتمدة تُقرأ بحدّ ٥٠، واحتساب التوكنات upsert تراكمي باليوم.
*/

const sqlMock = vi.hoisted(() => vi.fn());
vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ sql: sqlMock }),
}));

const {
  setAgentProposalStatus,
  claimAgentProposal,
  finishAgentProposal,
  saveAgentMemory,
  decideAgentLesson,
  listApprovedAgentLessons,
  logAgentUsage,
  listMosquePersonNames,
} = await import("./store");

function sqlText(): string {
  return (sqlMock.mock.calls[0] as unknown as [TemplateStringsArray])[0].join("");
}

afterEach(() => {
  sqlMock.mockReset();
  vi.restoreAllMocks();
});

describe("setAgentProposalStatus", () => {
  it("تحديث ذرّي: بنطاق الجامع ومن pending فقط، ويرفع decided_at", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 5, mosque_id: 1, user_id: 2, kind: "create_family", payload: {}, status: "rejected", created_at: "", decided_at: "x" },
    ]);

    const proposal = await setAgentProposalStatus(1, 5, "rejected");

    expect(proposal?.status).toBe("rejected");
    const text = sqlText();
    expect(text).toContain("UPDATE agent_proposals");
    expect(text).toContain("WHERE mosque_id =");
    expect(text).toContain("AND status = 'pending'");
    expect(text).toContain("decided_at = now()");
  });

  it("لا صف محدَّث = null (محسوم سابقاً أو جامع آخر) — لا يُفترض النجاح", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await setAgentProposalStatus(9, 5, "rejected")).toBeNull();
  });
});

describe("claimAgentProposal / finishAgentProposal", () => {
  it("الحجز ذرّي: pending → executing بنطاق الجامع", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 5, mosque_id: 1, user_id: 2, kind: "k", payload: {}, status: "executing", created_at: "", decided_at: null },
    ]);
    expect((await claimAgentProposal(1, 5))?.status).toBe("executing");
    const text = sqlText();
    expect(text).toContain("SET status = 'executing'");
    expect(text).toContain("WHERE mosque_id =");
    expect(text).toContain("AND status = 'pending'");
  });

  it("الحجز الثاني لا يجد صفاً = null", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await claimAgentProposal(1, 5)).toBeNull();
  });

  it("الإنهاء من executing فقط", async () => {
    sqlMock.mockResolvedValueOnce([
      { id: 5, mosque_id: 1, user_id: 2, kind: "k", payload: {}, status: "approved", created_at: "", decided_at: "x" },
    ]);
    expect((await finishAgentProposal(1, 5, "approved"))?.status).toBe("approved");
    expect(sqlText()).toContain("AND status = 'executing'");
  });
});

describe("saveAgentMemory", () => {
  it("إدراج ثم تقليم الأقدم فوق السقف — استعلامان بالترتيب", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 1, content: "تفضيل", created_at: "" }]);
    sqlMock.mockResolvedValueOnce([]);

    const memory = await saveAgentMemory(3, "تفضيل", "agent");

    expect(memory.content).toBe("تفضيل");
    expect(sqlMock).toHaveBeenCalledTimes(2);
    const prune = (sqlMock.mock.calls[1] as unknown as [TemplateStringsArray])[0].join("");
    expect(prune).toContain("DELETE FROM agent_memories");
    expect(prune).toContain("LIMIT");
  });
});

describe("decideAgentLesson / listApprovedAgentLessons", () => {
  it("الحسم من pending فقط — الموافقة والرفض بنفس الذرّية", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 7, content: "درس", from_mosque_id: 2, status: "approved", created_at: "", decided_at: "" }]);

    const lesson = await decideAgentLesson(7, "approved");

    expect(lesson?.status).toBe("approved");
    const text = sqlText();
    expect(text).toContain("UPDATE agent_lessons");
    expect(text).toContain("AND status = 'pending'");
  });

  it("المعتمد يُقرأ WHERE approved بحدّ علوي", async () => {
    sqlMock.mockResolvedValue([{ id: 1, content: "درس", from_mosque_id: 1, status: "approved", created_at: "", decided_at: null }]);

    const lessons = await listApprovedAgentLessons(50);

    expect(lessons).toHaveLength(1);
    const text = sqlText();
    expect(text).toContain("WHERE status = 'approved'");
    const values = (sqlMock.mock.calls[0] as unknown as unknown[]).slice(1);
    expect(values).toContain(50);
  });
});

describe("logAgentUsage", () => {
  it("upsert تراكمي لكل (جامع، يوم) — يجمع لا يستبدل", async () => {
    sqlMock.mockResolvedValueOnce([]);

    await logAgentUsage(4, 1200, 300);

    const text = sqlText();
    expect(text).toContain("INSERT INTO agent_usage");
    expect(text).toContain("ON CONFLICT (mosque_id, day) DO UPDATE");
    expect(text).toContain("input_tokens = agent_usage.input_tokens + excluded.input_tokens");
    expect(text).toContain("output_tokens = agent_usage.output_tokens + excluded.output_tokens");
    const values = (sqlMock.mock.calls[0] as unknown as unknown[]).slice(1);
    expect(values).toEqual([4, expect.any(String), 1200, 300]);
  });
});

describe("listMosquePersonNames", () => {
  it("أسماء أشخاص الجامع من مصادره الثلاثة — تسجيلات وأعضاء ومعلمون", async () => {
    sqlMock.mockResolvedValueOnce([{ name: "طالب" }, { name: "عضو" }, { name: "معلم" }]);

    const names = await listMosquePersonNames(6);

    expect(names).toEqual(["طالب", "عضو", "معلم"]);
    const text = sqlText();
    expect(text).toContain("mosque_registrations");
    expect(text).toContain("mosque_members");
    expect(text).toContain("teachers");
  });
});
