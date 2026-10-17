import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMocks = vi.hoisted(() => ({ after: vi.fn((_callback: () => unknown) => undefined) }));
vi.mock("next/server", () => ({ after: afterMocks.after }));

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  disciplineContextForHalaqah: vi.fn(),
  restoreExpiredSuspensions: vi.fn(async () => ({ due: 0, restored: 0 })),
  runAbsenceLadder: vi.fn(
    async (): Promise<{ studentId: string; kind: string; level: number; reasonAr: string; notifyParent: boolean }[]> => [],
  ),
  listHalaqahEvents: vi.fn(async () => []),
  listHalaqahStudentsBasic: vi.fn(async () => []),
  listActiveSuspensions: vi.fn(async () => []),
}));
vi.mock("@/lib/discipline-db", () => dbMocks);

const notifyMocks = vi.hoisted(() => ({
  notifyParentsOfLadderEvents: vi.fn(
    async (_halaqahId: number, _inserted: { studentId: string; notifyParent: boolean; kind: string }[]) => undefined,
  ),
}));
vi.mock("@/lib/discipline-notify", () => notifyMocks);

vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const { GET } = await import("./route");

const teacher = (role: "supervisor" | "assistant") => ({ id: 7, halaqahId: 3, halaqahName: "حلقة الفجر", role });

describe("GET /api/discipline — بوابة المعلّم", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.runAbsenceLadder.mockResolvedValue([]);
    authMocks.currentTeacher.mockResolvedValue(teacher("supervisor"));
    dbMocks.disciplineContextForHalaqah.mockResolvedValue({
      mosqueId: 5,
      mosqueName: "جامع النور",
      config: { absence: {}, violations: {} },
    });
  });

  it("بلا جلسة: 401 ولا فحص ميزة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(dbMocks.disciplineContextForHalaqah).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة أو حلقة غير مربوطة بجامع: 404 ولا حساب سُلّم", async () => {
    dbMocks.disciplineContextForHalaqah.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(dbMocks.runAbsenceLadder).not.toHaveBeenCalled();
  });

  it("السعادة: الفحص الكسول (استرجاع ثم سُلّم) ثم القوائم — والحلقة من الجلسة", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(dbMocks.restoreExpiredSuspensions).toHaveBeenCalledWith({ halaqahId: 3 });
    expect(dbMocks.runAbsenceLadder).toHaveBeenCalledWith(3, expect.any(String), expect.objectContaining({ absence: {} }));
    expect(dbMocks.listHalaqahEvents).toHaveBeenCalledWith(3);
    expect(dbMocks.listHalaqahStudentsBasic).toHaveBeenCalledWith(3);
    expect(dbMocks.listActiveSuspensions).toHaveBeenCalledWith({ halaqahId: 3 });
  });

  it("أحداث مُدرجة حديثاً: after() واحد لإشعار الأولياء بعد الرد", async () => {
    dbMocks.runAbsenceLadder.mockResolvedValue([
      { studentId: "s1", kind: "absence_warning", level: 1, reasonAr: "x", notifyParent: true },
    ]);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(afterMocks.after).toHaveBeenCalledTimes(1);
    const callback = afterMocks.after.mock.calls[0][0] as unknown as () => Promise<void>;
    await callback();
    expect(notifyMocks.notifyParentsOfLadderEvents).toHaveBeenCalledWith(3, [
      { studentId: "s1", kind: "absence_warning", level: 1, reasonAr: "x", notifyParent: true },
    ]);
  });

  it("لا أحداث جديدة: لا after() إطلاقاً", async () => {
    await GET();
    expect(afterMocks.after).not.toHaveBeenCalled();
  });

  it("المساعد بصلاحية مطابقة للمشرف", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacher("assistant"));
    expect((await GET()).status).toBe(200);
  });
});
