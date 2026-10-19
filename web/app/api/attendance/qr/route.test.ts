import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCheckinToken } from "@/lib/qr-checkin";

const SECRET = "route-test-secret-cccccccccccccccc";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const qrDb = vi.hoisted(() => ({
  qrAttendanceEnabledForHalaqah: vi.fn(),
  checkinSecret: vi.fn(async () => "route-test-secret-cccccccccccccccc"),
}));
vi.mock("@/lib/qr-checkin-db", () => qrDb);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "slow" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const { GET } = await import("./route");
const get = (qs = "") => GET(new Request(`http://localhost/api/attendance/qr${qs}`));

describe("GET /api/attendance/qr — رمز الحلقة للمعلّم", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rateMocks.checkRateLimit.mockResolvedValue(true);
    authMocks.currentTeacher.mockResolvedValue({ id: 4, halaqahId: 9 });
    qrDb.qrAttendanceEnabledForHalaqah.mockResolvedValue(true);
  });

  it("بلا جلسة: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("تجاوز الحد: 429", async () => {
    rateMocks.checkRateLimit.mockResolvedValue(false);
    expect((await get()).status).toBe(429);
  });

  it("الميزة معطّلة: 404 بلا رمز، وفحص probe يرد enabled:false بـ200", async () => {
    qrDb.qrAttendanceEnabledForHalaqah.mockResolvedValue(false);
    const res = await get();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ enabled: false });
    const probe = await get("?probe=1");
    expect(probe.status).toBe(200);
    expect(await probe.json()).toEqual({ enabled: false });
  });

  it("probe المفعّلة: بلا رمز في الرد", async () => {
    expect(await (await get("?probe=1")).json()).toEqual({ enabled: true });
  });

  it("يصدر رمزاً صالحاً لحلقة المعلّم من الجلسة (ولا يقبل حلقة من الاستعلام)", async () => {
    const body = await (await get("?halaqah=999&date=2020-01-01")).json();
    expect(body.enabled).toBe(true);
    expect(body.path).toBe(`/student/checkin?t=${encodeURIComponent(body.token)}`);
    expect(body.expiresAt).toBeGreaterThan(Date.now() - 1);
    expect(verifyCheckinToken(SECRET, body.token, { halaqahId: 9, today: body.date, nowMs: Date.now() })).toEqual({
      ok: true,
    });
    // نفس الرمز مرفوض لحلقة أخرى
    expect(verifyCheckinToken(SECRET, body.token, { halaqahId: 999, today: body.date, nowMs: Date.now() })).toEqual({
      ok: false,
      reason: "wrong_halaqah",
    });
  });
});
