import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  sql: vi.fn(),
  isFeatureEnabled: vi.fn(),
  logServerError: vi.fn(async () => undefined),
  after: vi.fn(),
}));
vi.mock("./db", () => ({ db: () => ({ sql: m.sql }) }));
vi.mock("./mosque/db", () => ({ isFeatureEnabled: m.isFeatureEnabled }));
vi.mock("./dev-error-log", () => ({ logServerError: m.logServerError }));
vi.mock("next/server", () => ({ after: m.after }));

const { emitMosqueEvent, emitHalaqahEvent } = await import("./webhooks-db");
const { attendanceRecordedPayload, progressApprovedPayload, progressRecordedPayload, studentCreatedPayload } = await import("./webhooks");

const sqlText = (call: unknown[]) => (call[0] as string[]).join("?");

describe("emitMosqueEvent / emitHalaqahEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.isFeatureEnabled.mockResolvedValue(true);
  });

  it("بلا نقطة مشتركة: استعلام واحد ولا إدراج", async () => {
    m.sql.mockResolvedValueOnce([{ mosque_id: 5, subscribed: false }]);
    await emitMosqueEvent(5, "student.created", {});
    expect(m.sql).toHaveBeenCalledTimes(1);
    expect(m.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it("حلقة بلا جامع: لا شيء", async () => {
    m.sql.mockResolvedValueOnce([{ mosque_id: null, subscribed: false }]);
    await emitHalaqahEvent(9, "attendance.recorded", {});
    expect(m.sql).toHaveBeenCalledTimes(1);
  });

  it("الميزة مغلقة: لا إدراج في الصندوق", async () => {
    m.sql.mockResolvedValueOnce([{ mosque_id: 5, subscribed: true }]);
    m.isFeatureEnabled.mockResolvedValue(false);
    await emitMosqueEvent(5, "progress.recorded", {});
    expect(m.sql).toHaveBeenCalledTimes(1);
    expect(m.after).not.toHaveBeenCalled();
  });

  it("مفعّلة ومشتركة: يُدرج ويجدول تسليماً فورياً عبر after", async () => {
    m.sql.mockResolvedValueOnce([{ mosque_id: 5, subscribed: true }]).mockResolvedValueOnce([{ id: 11 }, { id: 12 }]);
    await emitHalaqahEvent(9, "student.created", { id: "s" });
    expect(m.sql).toHaveBeenCalledTimes(2);
    expect(sqlText(m.sql.mock.calls[1])).toContain("INSERT INTO webhook_outbox");
    expect(m.after).toHaveBeenCalledTimes(1);
  });

  it("يبتلع خطأ القاعدة ويسجّله ولا يرمي", async () => {
    m.sql.mockRejectedValueOnce(new Error("db down"));
    await expect(emitMosqueEvent(5, "student.created", {})).resolves.toBeUndefined();
    expect(m.logServerError).toHaveBeenCalled();
  });

  it("فشل after (خارج سياق طلب) لا يرمي", async () => {
    m.sql.mockResolvedValueOnce([{ mosque_id: 5, subscribed: true }]).mockResolvedValueOnce([{ id: 1 }]);
    m.after.mockImplementationOnce(() => {
      throw new Error("outside request scope");
    });
    await expect(emitMosqueEvent(5, "student.created", {})).resolves.toBeUndefined();
  });
});

describe("حمولات الأحداث", () => {
  it("progress.approved: نفس الشكل بحالة approved وبلا ملاحظات", () => {
    const p = progressApprovedPayload(7, 2, "s", { date: "2026-10-20", reviewAyah: { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7 } });
    expect(p).toMatchObject({ id: 7, halaqah_id: 2, student_id: "s", status: "approved" });
    expect(p.review).toEqual({ from_surah: 1, from_ayah: 1, to_surah: 1, to_ayah: 7 });
    expect(JSON.stringify(p)).not.toContain("note");
  });

  it("بلا ملاحظات ولا بيانات اتصال", () => {
    const p = progressRecordedPayload(1, 2, "s", {
      date: "2026-10-20",
      hifzAyah: { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 },
    });
    expect(p).toEqual({
      id: 1,
      halaqah_id: 2,
      student_id: "s",
      date: "2026-10-20",
      status: "new",
      hifz: { from_surah: 2, from_ayah: 1, to_surah: 2, to_ayah: 5 },
      review: { from_surah: null, from_ayah: null, to_surah: null, to_ayah: null },
    });
    expect(JSON.stringify(p)).not.toContain("note");
    expect(studentCreatedPayload(3, "s1", "x")).toEqual({ id: "s1", halaqah_id: 3, name: "x", active: true });
    expect(attendanceRecordedPayload(3, "2026-10-20", [{ studentId: "a", status: "late" }])).toEqual({
      halaqah_id: 3,
      date: "2026-10-20",
      records: [{ student_id: "a", status: "late" }],
    });
  });
});
