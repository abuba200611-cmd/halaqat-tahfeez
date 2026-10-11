import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ setAssistantActive: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const { PATCH } = await import("./route");

const SUPERVISOR = { id: 2, halaqahId: 7, role: "supervisor" as const };
const ASSISTANT = { id: 3, halaqahId: 7, role: "assistant" as const };

function call(id: string, body: unknown): Promise<Response> {
  const request = new Request(`http://localhost/api/teacher/assistants/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(request, { params: Promise.resolve({ id }) });
}

describe("PATCH /api/teacher/assistants/[id] — إيقاف المساعد وتفعيله (STEP 60)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("المشرف يوقف مساعداً بحلقته: 200 والحلقة من جلسته حصراً", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    dbMocks.setAssistantActive.mockResolvedValue(true);

    const res = await call("5", { active: false });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(dbMocks.setAssistantActive).toHaveBeenCalledWith(7, 5, false);
  });

  it("إعادة التفعيل تعمل بنفس المسار: active=true يصل كما هو", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    dbMocks.setAssistantActive.mockResolvedValue(true);

    const res = await call("5", { active: true });

    expect(res.status).toBe(200);
    expect(dbMocks.setAssistantActive).toHaveBeenCalledWith(7, 5, true);
  });

  it("مساعد يستدعي: 403 ولا يُلمس أي صف", async () => {
    authMocks.currentTeacher.mockResolvedValue(ASSISTANT);

    const res = await call("9", { active: false });

    expect(res.status).toBe(403);
    expect(dbMocks.setAssistantActive).not.toHaveBeenCalled();
  });

  it("هدف خارج الحلقة أو مشرف آخر أو المستدعي نفسه (صفر صفوف): 404", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);
    dbMocks.setAssistantActive.mockResolvedValue(false);

    // المعرّفات الثلاثة كلها تمر بنفس المسار — الفرق يحسمه شرط الاستعلام
    for (const id of ["2", "4", "99"]) {
      const res = await call(id, { active: false });
      expect(res.status).toBe(404);
    }
    expect(dbMocks.setAssistantActive).toHaveBeenCalledTimes(3);
  });

  it("قيمة غير boolean (أو جسم فاسد): 400 بلا أي تغيير", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);

    const res = await call("5", { active: "نعم" });

    expect(res.status).toBe(400);
    expect(dbMocks.setAssistantActive).not.toHaveBeenCalled();
  });

  it("معرّف غير رقمي: 404 قبل أي استعلام", async () => {
    authMocks.currentTeacher.mockResolvedValue(SUPERVISOR);

    const res = await call("abc", { active: false });

    expect(res.status).toBe(404);
    expect(dbMocks.setAssistantActive).not.toHaveBeenCalled();
  });

  it("غير المسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);

    expect((await call("5", { active: false })).status).toBe(401);
  });
});
