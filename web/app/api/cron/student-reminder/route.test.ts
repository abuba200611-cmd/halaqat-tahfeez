import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMocks = vi.hoisted(() => ({ runStudentDailyReminder: vi.fn() }));
vi.mock("@/lib/push", () => pushMocks);
vi.mock("@/lib/riyadh-date", () => ({ riyadhTodayISO: () => "2026-09-27" }));
vi.mock("@/lib/webhooks-db", () => ({ deliverDueWebhooks: vi.fn(async () => null) }));

const retentionMocks = vi.hoisted(() => ({ runRetentionCleanup: vi.fn() }));
vi.mock("@/lib/retention", () => retentionMocks);
const auditMocks = vi.hoisted(() => ({ logSecurityEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit-log", () => auditMocks);

const { GET } = await import("./route");

const ORIGINAL_SECRET = process.env.CRON_SECRET;

function req(headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/cron/student-reminder", { headers });
}

describe("GET /api/cron/student-reminder — حماية الـcron (STEP 54)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    retentionMocks.runRetentionCleanup.mockResolvedValue([]);
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it("بدون CRON_SECRET مضبوط بالبيئة: 500 ولا يُرسَل شيء", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(pushMocks.runStudentDailyReminder).not.toHaveBeenCalled();
  });

  it("بلا ترويسة Authorization: 401 ولا يُرسَل شيء", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(pushMocks.runStudentDailyReminder).not.toHaveBeenCalled();
  });

  it("بترويسة Authorization خطأ: 401 ولا يُرسَل شيء", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    const res = await GET(req({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
    expect(pushMocks.runStudentDailyReminder).not.toHaveBeenCalled();
  });

  it("بترويسة صحيحة: 200، ويستدعي التذكير بتاريخ اليوم بتوقيت الرياض ويرجع نتيجته", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    pushMocks.runStudentDailyReminder.mockResolvedValue({ sent: 2, skipped: 3, removed: 1, failed: 0 });

    const res = await GET(req({ authorization: "Bearer s3cr3t" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 2, skipped: 3, removed: 1, failed: 0, retention: { total: 0 } });
    expect(pushMocks.runStudentDailyReminder).toHaveBeenCalledWith("2026-09-27");
  });

  it("تنظيف الاحتفاظ يعمل ويسجّل retention.cleanup بالأعداد", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    pushMocks.runStudentDailyReminder.mockResolvedValue({ sent: 0 });
    retentionMocks.runRetentionCleanup.mockResolvedValue([
      { key: "a", label: "a", deleted: 3 },
      { key: "b", label: "b", deleted: 0, error: "x" },
    ]);
    const res = await GET(req({ authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    expect(auditMocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "retention.cleanup", actorKind: "developer", details: { source: "cron", total: 3, a: 3, b: "error" } }),
    );
  });

  it("فشل التنظيف لا يُفشل الـcron", async () => {
    process.env.CRON_SECRET = "s3cr3t";
    pushMocks.runStudentDailyReminder.mockResolvedValue({ sent: 1 });
    retentionMocks.runRetentionCleanup.mockRejectedValue(new Error("db down"));
    const res = await GET(req({ authorization: "Bearer s3cr3t" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sent: 1 });
    expect(auditMocks.logSecurityEvent).not.toHaveBeenCalled();
  });
});
