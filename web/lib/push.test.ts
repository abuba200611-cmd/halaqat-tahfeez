import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  STEP 54 — نحاكي كامل lib/db.ts وlib/web-push بدل الاتصال بقاعدة
  بيانات حقيقية (نفس أسلوب lib/db.test.ts لـSTEP 52: db.ts هناك تحت
  الاختبار فنحاكي @netlify/database؛ هنا push.ts تحت الاختبار وdb.ts
  مجرّد تبعية، فنحاكيها مباشرة).
*/
const dbMocks = vi.hoisted(() => ({
  listStudentPushSubscriptionsForReminder: vi.fn(),
  markStudentPushSubscriptionSuccess: vi.fn(),
  deleteStudentPushSubscription: vi.fn(),
  listStudentPushSubscriptions: vi.fn(),
  listPushSubscriptions: vi.fn(),
  listHalaqahTeachers: vi.fn(),
  deletePushSubscription: vi.fn(),
  vapidKeys: vi.fn(),
  setVapidKeys: vi.fn(),
}));
vi.mock("./db", () => dbMocks);

const webpushMocks = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
  generateVAPIDKeys: vi.fn(() => ({ publicKey: "pub", privateKey: "priv" })),
}));
vi.mock("web-push", () => ({ default: webpushMocks }));

const { runStudentDailyReminder } = await import("./push");

beforeEach(() => {
  vi.clearAllMocks();
  dbMocks.vapidKeys.mockResolvedValue({ publicKey: "pub", privateKey: "priv" });
});

describe("runStudentDailyReminder (STEP 54)", () => {
  it("يتخطى من سجّل ورد اليوم بالفعل، ويرسل فقط لمن لم يسجّل — بتوقيت الرياض المُمرَّر من المستدعي", async () => {
    dbMocks.listStudentPushSubscriptionsForReminder.mockResolvedValue([
      { teacherId: 1, studentId: "a", endpoint: "e1", p256dh: "p", auth: "a", hasWardToday: true },
      { teacherId: 1, studentId: "b", endpoint: "e2", p256dh: "p", auth: "a", hasWardToday: false },
    ]);
    webpushMocks.sendNotification.mockResolvedValue(undefined);

    const result = await runStudentDailyReminder("2026-09-27");

    expect(result).toEqual({ sent: 1, skipped: 1, removed: 0, failed: 0 });
    expect(webpushMocks.sendNotification).toHaveBeenCalledTimes(1);
    expect(webpushMocks.sendNotification.mock.calls[0][0]).toMatchObject({ endpoint: "e2" });
    expect(dbMocks.markStudentPushSubscriptionSuccess).toHaveBeenCalledWith("e2");
    expect(dbMocks.listStudentPushSubscriptionsForReminder).toHaveBeenCalledWith("2026-09-27");
  });

  it("يحذف الاشتراك تلقائياً عند 404/410 ويعدّها removed لا failed", async () => {
    dbMocks.listStudentPushSubscriptionsForReminder.mockResolvedValue([
      { teacherId: 1, studentId: "a", endpoint: "gone-404", p256dh: "p", auth: "a", hasWardToday: false },
      { teacherId: 1, studentId: "b", endpoint: "gone-410", p256dh: "p", auth: "a", hasWardToday: false },
    ]);
    webpushMocks.sendNotification.mockImplementation((sub: { endpoint: string }) => {
      const statusCode = sub.endpoint === "gone-404" ? 404 : 410;
      return Promise.reject(Object.assign(new Error("gone"), { statusCode }));
    });

    const result = await runStudentDailyReminder("2026-09-27");

    expect(result).toEqual({ sent: 0, skipped: 0, removed: 2, failed: 0 });
    expect(dbMocks.deleteStudentPushSubscription).toHaveBeenCalledWith("gone-404");
    expect(dbMocks.deleteStudentPushSubscription).toHaveBeenCalledWith("gone-410");
  });

  it("خطأ آخر غير 404/410 يُعدّ failed ولا يحذف الاشتراك ولا يوقف البقية", async () => {
    dbMocks.listStudentPushSubscriptionsForReminder.mockResolvedValue([
      { teacherId: 1, studentId: "a", endpoint: "flaky", p256dh: "p", auth: "a", hasWardToday: false },
      { teacherId: 1, studentId: "b", endpoint: "ok", p256dh: "p", auth: "a", hasWardToday: false },
    ]);
    webpushMocks.sendNotification.mockImplementation((sub: { endpoint: string }) => {
      if (sub.endpoint === "flaky") return Promise.reject(Object.assign(new Error("network"), { statusCode: 500 }));
      return Promise.resolve(undefined);
    });

    const result = await runStudentDailyReminder("2026-09-27");

    expect(result).toEqual({ sent: 1, skipped: 0, removed: 0, failed: 1 });
    expect(dbMocks.deleteStudentPushSubscription).not.toHaveBeenCalled();
  });
});
