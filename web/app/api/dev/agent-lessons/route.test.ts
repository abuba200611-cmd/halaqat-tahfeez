import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  دروس الإيجنت في لوحة المطوّر: حماية devConsoleGate (401 بلا أدمن،
  403 أثناء «عرض كـ»)، والاعتماد/الرفض عبر decideAgentLesson الذرّي.
*/

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  currentImpersonation: vi.fn(),
  listAgentLessonsForDev: vi.fn(),
  decideAgentLesson: vi.fn(),
}));

vi.mock("@/lib/mosque/admin-auth", () => ({
  isAdmin: mocks.isAdmin,
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
}));
vi.mock("@/lib/dev-impersonation", () => ({
  currentImpersonation: mocks.currentImpersonation,
  impersonationBlocked: () => Response.json({ error: "أثناء العرض كـ" }, { status: 403 }),
}));
vi.mock("@/lib/agent/store", () => ({
  listAgentLessonsForDev: mocks.listAgentLessonsForDev,
  decideAgentLesson: mocks.decideAgentLesson,
}));

const { GET: listGET } = await import("@/app/api/dev/agent-lessons/route");
const { POST: decidePOST } = await import("@/app/api/dev/agent-lessons/[id]/route");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentImpersonation.mockResolvedValue(null);
});

describe("حماية اللوحة", () => {
  it("بلا جلسة أدمن: 401 ولا قراءة", async () => {
    mocks.isAdmin.mockResolvedValue(false);
    expect((await listGET()).status).toBe(401);
    expect(mocks.listAgentLessonsForDev).not.toHaveBeenCalled();
  });

  it("أثناء «عرض كـ»: 403", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.currentImpersonation.mockResolvedValue({ kind: "teacher", targetId: 1 });
    expect((await listGET()).status).toBe(403);
  });
});

describe("القائمة والحسم", () => {
  it("أدمن طبيعي: الدروس بكل حالاتها مع اسم الجامع المقترح", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.listAgentLessonsForDev.mockResolvedValue([
      { id: 1, content: "درس عام", fromMosqueId: 2, fromMosqueName: "جامع آخر", status: "pending", createdAt: "", decidedAt: null },
    ]);

    const res = await listGET();
    const body = (await res.json()) as { lessons: { fromMosqueName: string }[] };
    expect(res.status).toBe(200);
    expect(body.lessons[0].fromMosqueName).toBe("جامع آخر");
  });

  it("approve يمرر للطبقة الذرّية، وreject كذلك — وغير المعروف 400", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.decideAgentLesson.mockResolvedValue({ id: 5, status: "approved" });

    const context = { params: Promise.resolve({ id: "5" }) };
    const request = (body: unknown) =>
      new Request("http://localhost/api/dev/agent-lessons/5", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    const approved = await decidePOST(request({ action: "approve" }), context);
    expect(approved.status).toBe(200);
    expect(mocks.decideAgentLesson).toHaveBeenCalledWith(5, "approved");

    await decidePOST(request({ action: "reject" }), context);
    expect(mocks.decideAgentLesson).toHaveBeenCalledWith(5, "rejected");

    expect((await decidePOST(request({ action: "publish" }), context)).status).toBe(400);
  });

  it("درس محسوم سابقاً: 409 من الذرّية", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.decideAgentLesson.mockResolvedValue(null);

    const context = { params: Promise.resolve({ id: "9" }) };
    const res = await decidePOST(
      new Request("http://localhost/api/dev/agent-lessons/9", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }),
      context,
    );
    expect(res.status).toBe(409);
  });
});
