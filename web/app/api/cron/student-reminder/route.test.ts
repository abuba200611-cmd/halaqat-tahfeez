import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMocks = vi.hoisted(() => ({ runStudentDailyReminder: vi.fn() }));
vi.mock("@/lib/push", () => pushMocks);
vi.mock("@/lib/riyadh-date", () => ({ riyadhTodayISO: () => "2026-09-27" }));

const { GET } = await import("./route");

const ORIGINAL_SECRET = process.env.CRON_SECRET;

function req(headers?: Record<string, string>): Request {
  return new Request("http://localhost/api/cron/student-reminder", { headers });
}

describe("GET /api/cron/student-reminder — حماية الـcron (STEP 54)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(await res.json()).toEqual({ sent: 2, skipped: 3, removed: 1, failed: 0 });
    expect(pushMocks.runStudentDailyReminder).toHaveBeenCalledWith("2026-09-27");
  });
});
