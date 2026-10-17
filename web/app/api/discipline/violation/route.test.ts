import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMocks = vi.hoisted(() => ({ after: vi.fn() }));
vi.mock("next/server", () => ({ after: afterMocks.after }));

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  disciplineContextForHalaqah: vi.fn(),
  recordViolation: vi.fn(),
}));
vi.mock("@/lib/discipline-db", () => dbMocks);

const pushMocks = vi.hoisted(() => ({ sendPushToParentsOfDiscipline: vi.fn(async () => undefined) }));
vi.mock("@/lib/push", () => pushMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "limit" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const { POST } = await import("./route");

const teacher = { id: 7, halaqahId: 3, role: "supervisor" as const };
const CATEGORIES = ["إخلال بالسلوك", "أخرى"];
const ctx = { mosqueId: 5, mosqueName: "جامع النور", config: { violations: { categories: CATEGORIES, escalateEvery: 1, suspensionDays: 3 } } };

const post = (body: unknown) =>
  new Request("http://localhost/api/discipline/violation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/discipline/violation — تسجيل مخالفة", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(teacher);
    dbMocks.disciplineContextForHalaqah.mockResolvedValue(ctx);
    dbMocks.recordViolation.mockResolvedValue({ found: true, step: 2, eventId: 9, suspensionUntil: null });
  });

  it("بلا جلسة: 401 ولا كتابة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await POST(post({ studentId: "s1", category: "أخرى" }))).status).toBe(401);
    expect(dbMocks.recordViolation).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة: 404 ولا كتابة", async () => {
    dbMocks.disciplineContextForHalaqah.mockResolvedValue(null);
    expect((await POST(post({ studentId: "s1", category: "أخرى" }))).status).toBe(404);
    expect(dbMocks.recordViolation).not.toHaveBeenCalled();
  });

  it("تجاوز حدّ المعدّل: 429", async () => {
    rateMocks.checkRateLimit.mockResolvedValueOnce(false);
    expect((await POST(post({ studentId: "s1", category: "أخرى" }))).status).toBe(429);
  });

  it("تصنيف خارج قائمة الجامع أو طالب مفقود: 400", async () => {
    expect((await POST(post({ studentId: "s1", category: "تصنيف مجهول" }))).status).toBe(400);
    expect((await POST(post({ category: "أخرى" }))).status).toBe(400);
    expect(dbMocks.recordViolation).not.toHaveBeenCalled();
  });

  it("الطالب من حلقة أخرى: الاستعلام المشروط لا يجده = 404", async () => {
    dbMocks.recordViolation.mockResolvedValue({ found: false, step: 1, eventId: null, suspensionUntil: null });
    const res = await POST(post({ studentId: "foreign", category: "أخرى" }));
    expect(res.status).toBe(404);
    // الحلقة (3) من الجلسة لا من الجسم، والمعلّم (7) هو المسجِّل
    expect(dbMocks.recordViolation).toHaveBeenCalledWith(
      expect.objectContaining({ halaqahId: 3, studentId: "foreign", createdBy: 7 }),
    );
  });

  it("درجة الإشعار (٤): إشعار ولي الأمر بعد الرد عبر after()", async () => {
    dbMocks.recordViolation.mockResolvedValue({ found: true, step: 4, eventId: 12, suspensionUntil: null });
    const res = await POST(post({ studentId: "s1", category: "أخرى", note: "  متكرر  " }));
    expect(res.status).toBe(200);
    expect(afterMocks.after).toHaveBeenCalledTimes(1);
    const callback = afterMocks.after.mock.calls[0][0] as () => Promise<void>;
    await callback();
    expect(pushMocks.sendPushToParentsOfDiscipline).toHaveBeenCalledWith(3, "s1", "warning");
  });

  it("درجة الإيقاف (٥): يعاد تاريخ النهاية مع الدرجة، ولا إشعار ولي أمر", async () => {
    dbMocks.recordViolation.mockResolvedValue({ found: true, step: 5, eventId: 13, suspensionUntil: "2026-10-20T00:00:00.000Z" });
    const res = await POST(post({ studentId: "s1", category: "أخرى" }));
    const body = (await res.json()) as { stepLabel?: string; suspensionUntil?: string };
    expect(res.status).toBe(200);
    expect(body.stepLabel).toBe("إيقاف مؤقت");
    expect(body.suspensionUntil).toContain("2026-10-20");
    expect(afterMocks.after).not.toHaveBeenCalled();
  });

  it("ملاحظة غير نصية: 400", async () => {
    expect((await POST(post({ studentId: "s1", category: "أخرى", note: 5 }))).status).toBe(400);
  });
});
