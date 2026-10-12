import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMocks = vi.hoisted(() => ({
  after: vi.fn((cb: () => unknown) => {
    afterMocks.lastCallback = cb;
  }),
  lastCallback: undefined as (() => unknown) | undefined,
}));
vi.mock("next/server", () => ({ after: afterMocks.after }));

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ reviewRecitation: vi.fn() }));
vi.mock("@/lib/recitations-db", () => dbMocks);

const pushMocks = vi.hoisted(() => ({ sendPushToStudent: vi.fn(), sendPushToParentsOfRecitation: vi.fn() }));
vi.mock("@/lib/push", () => pushMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "limit" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

const { PATCH } = await import("./route");

const patch = (body: unknown, id = "5") =>
  PATCH(
    new Request(`http://localhost/api/recitations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );

describe("PATCH /api/recitations/[id] — تقييم المعلّم (STEP 64)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterMocks.lastCallback = undefined;
    authMocks.currentTeacher.mockResolvedValue({ id: 7, halaqahId: 3 });
    dbMocks.reviewRecitation.mockResolvedValue({ found: true, studentId: "s1", wasPending: true });
  });

  it("بلا جلسة: 401 ولا كتابة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await patch({ score: 8 })).status).toBe(401);
    expect(dbMocks.reviewRecitation).not.toHaveBeenCalled();
  });

  it("يقبل درجات 1..10 فقط", async () => {
    for (const score of [0, 11, -3, 4.5, "x", null, undefined]) {
      expect((await patch({ score })).status).toBe(400);
    }
    expect(dbMocks.reviewRecitation).not.toHaveBeenCalled();
    for (const score of [1, 10]) expect((await patch({ score })).status).toBe(200);
  });

  it("يحفظ بحلقة المعلّم من الجلسة، والملاحظة تُقصّ", async () => {
    await patch({ score: 9, note: "  ممتاز  ", halaqahId: 99 });
    expect(dbMocks.reviewRecitation).toHaveBeenCalledWith(3, 5, 9, "ممتاز", 7);
  });

  it("تلاوة حلقة أخرى أو غير موجودة: 404", async () => {
    dbMocks.reviewRecitation.mockResolvedValue({ found: false });
    expect((await patch({ score: 8 })).status).toBe(404);
    expect(afterMocks.after).not.toHaveBeenCalled();
  });

  it("معرّف غير رقمي: 404 دون وصول للقاعدة", async () => {
    expect((await patch({ score: 8 }, "abc")).status).toBe(404);
    expect(dbMocks.reviewRecitation).not.toHaveBeenCalled();
  });

  it("أول تقييم: يُشعر الطالب والأولياء بعد الرد (after)", async () => {
    await patch({ score: 8 });
    expect(afterMocks.after).toHaveBeenCalledTimes(1);
    await afterMocks.lastCallback?.();
    expect(pushMocks.sendPushToStudent).toHaveBeenCalledWith(3, "s1", expect.objectContaining({ url: "/student/recitations" }));
    expect(pushMocks.sendPushToParentsOfRecitation).toHaveBeenCalledWith(3, "s1", 8);
  });

  it("تعديل تقييم سابق: لا إشعار مكرَّر", async () => {
    dbMocks.reviewRecitation.mockResolvedValue({ found: true, studentId: "s1", wasPending: false });
    await patch({ score: 6 });
    expect(afterMocks.after).not.toHaveBeenCalled();
  });

  it("فشل الإشعار لا يغيّر النتيجة", async () => {
    pushMocks.sendPushToStudent.mockRejectedValue(new Error("boom"));
    expect((await patch({ score: 8 })).status).toBe(200);
    await expect(afterMocks.lastCallback?.()).resolves.toBeUndefined();
  });

  it("حد المعدّل: 429", async () => {
    rateMocks.checkRateLimit.mockResolvedValueOnce(false);
    expect((await patch({ score: 8 })).status).toBe(429);
    expect(dbMocks.reviewRecitation).not.toHaveBeenCalled();
  });
});
