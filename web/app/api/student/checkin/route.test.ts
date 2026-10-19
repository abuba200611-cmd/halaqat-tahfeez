import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckinToken, CHECKIN_WINDOW_MS } from "@/lib/qr-checkin";
import { riyadhTodayISO } from "@/lib/riyadh-date";

const SECRET = "route-test-secret-dddddddddddddddd";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const attDb = vi.hoisted(() => ({ recordQrCheckin: vi.fn() }));
vi.mock("@/lib/attendance-db", () => attDb);

const qrDb = vi.hoisted(() => ({
  qrAttendanceEnabledForHalaqah: vi.fn(),
  checkinSecret: vi.fn(async () => "route-test-secret-dddddddddddddddd"),
}));
vi.mock("@/lib/qr-checkin-db", () => qrDb);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "slow" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const { POST } = await import("./route");
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/student/checkin", { method: "POST", body: JSON.stringify(body) }));
const tokenFor = (halaqahId: number, ageMs = 0, date = riyadhTodayISO()) =>
  createCheckinToken(SECRET, halaqahId, date, Date.now() - ageMs);

describe("POST /api/student/checkin — مسح الطالب", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateMocks.checkRateLimit.mockResolvedValue(true);
    authMocks.currentStudent.mockResolvedValue({ teacherId: 9, id: "s1", name: "x", halaqahName: "h" });
    qrDb.qrAttendanceEnabledForHalaqah.mockResolvedValue(true);
    attDb.recordQrCheckin.mockResolvedValue({ found: true, alreadyRecorded: false, status: "present" });
  });

  it("بلا جلسة طالب: 401 ولا تسجيل", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    expect((await post({ t: tokenFor(9) })).status).toBe(401);
    expect(attDb.recordQrCheckin).not.toHaveBeenCalled();
  });

  it("تجاوز الحد: 429 ولا تسجيل", async () => {
    rateMocks.checkRateLimit.mockResolvedValue(false);
    expect((await post({ t: tokenFor(9) })).status).toBe(429);
    expect(attDb.recordQrCheckin).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة لحلقته: 404", async () => {
    qrDb.qrAttendanceEnabledForHalaqah.mockResolvedValue(false);
    expect((await post({ t: tokenFor(9) })).status).toBe(404);
    expect(attDb.recordQrCheckin).not.toHaveBeenCalled();
  });

  it("رمز صالح: يسجّل حضور الطالب نفسه بحلقته من الجلسة", async () => {
    const res = await post({ t: tokenFor(9) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, alreadyRecorded: false, status: "present" });
    expect(attDb.recordQrCheckin).toHaveBeenCalledWith(9, "s1", riyadhTodayISO());
  });

  it("مسح مكرّر أو بعد قرار المعلّم: يرد بالحالة القائمة بلا خطأ (idempotent)", async () => {
    attDb.recordQrCheckin.mockResolvedValue({ found: true, alreadyRecorded: true, status: "excused" });
    const res = await post({ t: tokenFor(9) });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ alreadyRecorded: true, status: "excused", statusLabel: "مستأذن" });
  });

  it("رمز حلقة أخرى: 403 ولا تسجيل (حتى لو توقيعه سليم)", async () => {
    const res = await post({ t: tokenFor(10) });
    expect(res.status).toBe(403);
    expect((await res.json()).reason).toBe("wrong_halaqah");
    expect(attDb.recordQrCheckin).not.toHaveBeenCalled();
  });

  it("رمز منتهي: 400", async () => {
    const res = await post({ t: tokenFor(9, 10 * CHECKIN_WINDOW_MS) });
    expect(res.status).toBe(400);
    expect((await res.json()).reason).toBe("expired");
    expect(attDb.recordQrCheckin).not.toHaveBeenCalled();
  });

  it("رمز يوم آخر: 400", async () => {
    const res = await post({ t: tokenFor(9, 0, "2020-01-01") });
    expect((await res.json()).reason).toBe("wrong_date");
    expect(attDb.recordQrCheckin).not.toHaveBeenCalled();
  });

  it("رمز مزوَّر أو مشوّه أو مفقود: 400", async () => {
    const good = tokenFor(9);
    const forged = good.slice(0, -1) + (good.endsWith("0") ? "1" : "0");
    expect((await (await post({ t: forged })).json()).reason).toBe("forged");
    expect((await (await post({ t: "garbage" })).json()).reason).toBe("malformed");
    expect((await (await post({})).json()).reason).toBe("malformed");
    expect(attDb.recordQrCheckin).not.toHaveBeenCalled();
  });

  it("الطالب غير فعّال/محذوف (الاستعلام لا يجده): 404", async () => {
    attDb.recordQrCheckin.mockResolvedValue({ found: false });
    expect((await post({ t: tokenFor(9) })).status).toBe(404);
  });
});
