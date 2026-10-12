import { beforeEach, describe, expect, it, vi } from "vitest";

const linkAuthMocks = vi.hoisted(() => ({
  // نفس عقد requireLinkSecret الحقيقي: سرّ صحيح → null (استمرار)، وإلا 401
  requireLinkSecret: vi.fn(async (request: Request, endpoint: string) => {
    if (request.headers.get("x-link-secret") === "test-link-secret") return null;
    return Response.json({ error: "غير مصرّح" }, { status: 401, headers: { "x-endpoint": endpoint } });
  }),
}));
vi.mock("@/lib/link-auth", () => linkAuthMocks);

const dbMocks = vi.hoisted(() => ({ findHalaqahByInviteCode: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const metricsDbMocks = vi.hoisted(() => ({ getHalaqahMetrics: vi.fn() }));
vi.mock("@/lib/metrics-db", () => metricsDbMocks);

const { GET } = await import("./route");
const { daysBeforeISO } = await import("@/lib/attendance");

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());

const SECRET = { "x-link-secret": "test-link-secret" };

const get = (query: string, headers: Record<string, string> = SECRET) =>
  GET(new Request(`http://localhost/api/link/metrics${query}`, { headers }));

/** شكل الاستجابة المسموح — أسماء وأرقام فقط (يُختبر بمفاتيح حرفية أدناه) */
const PAYLOAD = {
  halaqah: { name: "حلقة الفرقان", teacherName: "أ. خالد", activeStudents: 2 },
  totals: {
    wardsSubmitted: 40,
    wardsApproved: 31,
    attendanceRate: 87,
    planOnTrackRatio: 0.5,
    recitations: { count: 9, avgScore: 8.1 },
    hifzPagesInRange: 22,
  },
  students: [
    {
      id: "a1",
      name: "أحمد",
      wards: 19,
      approved: 17,
      attendanceRate: 90,
      streak: 6,
      hifzPagesInRange: 8,
      reviewPagesInRange: 40,
      plan: { status: "on_track", progressPct: 62 },
      recitations: { count: 3, avgScore: 8.3 },
      engagementScore: 84,
    },
    {
      id: "b2",
      name: "بدر",
      wards: 21,
      approved: 14,
      attendanceRate: 85,
      streak: 0,
      hifzPagesInRange: 14,
      reviewPagesInRange: 30,
      plan: null,
      recitations: { count: 6, avgScore: 8.0 },
      engagementScore: 79,
    },
  ],
};

describe("GET /api/link/metrics — المصادقة والتحقق (STEP 66)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.findHalaqahByInviteCode.mockResolvedValue({
      id: 5,
      teacherName: "أ. خالد",
      halaqahName: "حلقة الفرقان",
    });
    metricsDbMocks.getHalaqahMetrics.mockResolvedValue(PAYLOAD);
  });

  it("بلا سرّ أو بسرّ خاطئ: 401 ولا يُلمس رمز الدعوة ولا المقاييس", async () => {
    expect((await get("?invite=abc123", {})).status).toBe(401);
    expect((await get("?invite=abc123", { "x-link-secret": "wrong" })).status).toBe(401);
    expect(dbMocks.findHalaqahByInviteCode).not.toHaveBeenCalled();
    expect(metricsDbMocks.getHalaqahMetrics).not.toHaveBeenCalled();
  });

  it("رمز الدعوة مفقود: 400", async () => {
    expect((await get("")).status).toBe(400);
    expect(dbMocks.findHalaqahByInviteCode).not.toHaveBeenCalled();
  });

  it("تواريخ غير صحيحة: 400", async () => {
    expect((await get("?invite=abc123&from=2026-1-5&to=2026-10-12")).status).toBe(400);
    expect((await get("?invite=abc123&from=2026-02-31&to=2026-03-05")).status).toBe(400);
    expect((await get("?invite=abc123&to=not-a-date")).status).toBe(400);
    expect(dbMocks.findHalaqahByInviteCode).not.toHaveBeenCalled();
  });

  it("من بعد إلى: 400", async () => {
    expect((await get("?invite=abc123&from=2026-10-13&to=2026-10-12")).status).toBe(400);
  });

  it("مدى أطول من ١٢٠ يوماً: 400", async () => {
    const from = daysBeforeISO(TODAY, 120);
    expect((await get(`?invite=abc123&from=${from}&to=${TODAY}`)).status).toBe(400);
  });

  it("رمز دعوة غير معروف: 404", async () => {
    dbMocks.findHalaqahByInviteCode.mockResolvedValue(null);
    expect((await get("?invite=none")).status).toBe(404);
    expect(metricsDbMocks.getHalaqahMetrics).not.toHaveBeenCalled();
  });

  it("نجاح: الحلقة تُحلّ من الرمز وحده، والنطاق الافتراضي آخر ٣٠ يوماً بالرياض", async () => {
    const res = await get("?invite=abc123");
    expect(res.status).toBe(200);
    expect(dbMocks.findHalaqahByInviteCode).toHaveBeenCalledWith("abc123");
    expect(metricsDbMocks.getHalaqahMetrics).toHaveBeenCalledWith(
      { id: 5, halaqahName: "حلقة الفرقان", teacherName: "أ. خالد" },
      { from: daysBeforeISO(TODAY, 29), to: TODAY },
      TODAY,
    );
    expect(await res.json()).toEqual(PAYLOAD);
  });

  it("نطاق صريح يمرّ كما هو", async () => {
    const res = await get("?invite=abc123&from=2026-09-01&to=2026-09-30");
    expect(res.status).toBe(200);
    expect(metricsDbMocks.getHalaqahMetrics).toHaveBeenCalledWith(
      { id: 5, halaqahName: "حلقة الفرقان", teacherName: "أ. خالد" },
      { from: "2026-09-01", to: "2026-09-30" },
      TODAY,
    );
  });

  it("الاستجابة لا تحمل حقولاً خاصة — المفاتيح حرفياً كما اعتُمد", async () => {
    const res = await get("?invite=abc123");
    const body = (await res.json()) as typeof PAYLOAD;
    expect(Object.keys(body).sort()).toEqual(["halaqah", "students", "totals"]);
    expect(Object.keys(body.halaqah).sort()).toEqual(["activeStudents", "name", "teacherName"]);
    expect(Object.keys(body.totals).sort()).toEqual([
      "attendanceRate",
      "hifzPagesInRange",
      "planOnTrackRatio",
      "recitations",
      "wardsApproved",
      "wardsSubmitted",
    ]);
    for (const s of body.students) {
      expect(Object.keys(s).sort()).toEqual([
        "approved",
        "attendanceRate",
        "engagementScore",
        "hifzPagesInRange",
        "id",
        "name",
        "plan",
        "recitations",
        "reviewPagesInRange",
        "streak",
        "wards",
      ]);
    }
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/note|username|password|phone|parent|case/i);
  });
});
