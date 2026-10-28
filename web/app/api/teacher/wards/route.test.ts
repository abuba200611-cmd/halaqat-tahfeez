import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  001 T023 — POST /api/teacher/wards: المعلّم (مشرف أو مساعد) يسجّل ورداً
  عن طالب في حلقة ابتدائية فيُحفظ معتمداً باسمه (FR-003/FR-004/FR-005).
  الحلقة من الجلسة حصراً، والطالب من حلقة المعلّم وإلا 404، وحارس
  التكرار اليومي يرجع 409 DUPLICATE_TODAY ما لم يؤكَّد صراحة.
*/

const afterMocks = vi.hoisted(() => ({
  after: vi.fn((cb: () => unknown) => {
    afterMocks.lastCallback = cb;
  }),
  lastCallback: undefined as (() => unknown) | undefined,
}));
vi.mock("next/server", () => ({ after: afterMocks.after }));

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "غير مصرّح" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  createApprovedWardLog: vi.fn(),
  getActiveStudentInHalaqah: vi.fn(),
  listSameDayWardStubs: vi.fn(),
  listStudentsWithTodayWard: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const stageDbMocks = vi.hoisted(() => ({ getHalaqahStage: vi.fn() }));
vi.mock("@/lib/halaqah-stage-db", () => stageDbMocks);

const notifyMocks = vi.hoisted(() => ({
  notifyWardDecision: vi.fn(),
  emitApprovedWardEvents: vi.fn(async () => undefined),
}));
vi.mock("@/lib/ward-notify", () => notifyMocks);

const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

const { POST } = await import("./route");

const TEACHER = { id: 2, halaqahId: 7, role: "assistant" as const };

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/teacher/wards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const HIFZ = { from: { surah: 105, ayah: 1 }, to: { surah: 105, ayah: 5 } };

describe("POST /api/teacher/wards — تسجيل المعلّم عن طالب الابتدائي (001 US2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    authMocks.currentTeacher.mockResolvedValue(TEACHER);
    stageDbMocks.getHalaqahStage.mockResolvedValue("primary");
    dbMocks.getActiveStudentInHalaqah.mockResolvedValue({ id: "s1", name: "أحمد" });
    dbMocks.listSameDayWardStubs.mockResolvedValue([]);
    dbMocks.listStudentsWithTodayWard.mockResolvedValue([
      { id: "s1", name: "أحمد", todayWard: null },
      { id: "s2", name: "سعد", todayWard: null },
    ]);
    dbMocks.createApprovedWardLog.mockResolvedValue({ id: 55, previousAttemptId: null });
  });

  it("حلقة غير ابتدائية: 403 STAGE_NOT_PRIMARY ولا يُنشأ شيء", async () => {
    stageDbMocks.getHalaqahStage.mockResolvedValue("intermediate");

    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ }));
    const data = (await res.json()) as { code?: string; error?: string };

    expect(res.status).toBe(403);
    expect(data.code).toBe("STAGE_NOT_PRIMARY");
    expect(data.error).toBe("تسجيل الورد عن الطالب متاح لحلقات الابتدائي فقط");
    expect(dbMocks.createApprovedWardLog).not.toHaveBeenCalled();
  });

  it("حلقة بلا فئة (افتراضي): 403 كذلك — التسجيل عن الطالب للابتدائي فقط", async () => {
    stageDbMocks.getHalaqahStage.mockResolvedValue(null);

    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ }));

    expect(res.status).toBe(403);
    expect(dbMocks.createApprovedWardLog).not.toHaveBeenCalled();
  });

  it("نجاح: ورد معتمد باسم المعلّم (recorded_via=teacher) وأحداث recorded ثم approved وإخطار القرار", async () => {
    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ, note: "ما شاء الله" }));
    const data = (await res.json()) as { ok: boolean; id: number; status: string; nextStudentId: string | null };

    expect(res.status).toBe(200);
    expect(data).toEqual({ ok: true, id: 55, status: "approved", nextStudentId: "s2" });

    const [halaqahId, studentId, log, options] = dbMocks.createApprovedWardLog.mock.calls[0];
    expect(halaqahId).toBe(7);
    expect(studentId).toBe("s1");
    expect(options).toMatchObject({ recordedVia: "teacher", recordedByTeacherId: 2 });
    expect(log.hifzAyah).toEqual({ fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 });
    expect(log.note).toBe("ما شاء الله");
    // الأحداث ثم الإخطار — نفس ترتيب عقد المسار، والإخطار بعد الرد (after)
    expect(notifyMocks.emitApprovedWardEvents).toHaveBeenCalledWith(
      expect.objectContaining({ halaqahId: 7, studentId: "s1", wardId: 55 }),
    );
    expect(notifyMocks.notifyWardDecision).toHaveBeenCalledWith(
      expect.objectContaining({ halaqahId: 7, studentId: "s1", wardId: 55, status: "approved" }),
    );
  });

  it("wholeSurah: سورة كاملة من الآية ١ لآخر آية — بلا hifz يدوي", async () => {
    const res = await POST(postReq({ studentId: "s1", wholeSurah: 112 }));

    expect(res.status).toBe(200);
    const log = dbMocks.createApprovedWardLog.mock.calls[0][2];
    expect(log.hifzAyah).toEqual({ fromSurah: 112, fromAyah: 1, toSurah: 112, toAyah: 4 });
    expect(log.hifzFrom).toBe(604);
  });

  it("hifz وwholeSurah معاً: 400", async () => {
    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ, wholeSurah: 112 }));
    const data = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(data.error).toBe("اختر نطاق آيات أو سورة كاملة، لا الاثنين معاً");
    expect(dbMocks.createApprovedWardLog).not.toHaveBeenCalled();
  });

  it("طالب خارج الحلقة أو محذوف: 404 — الشرط داخل الاستعلام", async () => {
    dbMocks.getActiveStudentInHalaqah.mockResolvedValue(null);

    const res = await POST(postReq({ studentId: "ghost", hifz: HIFZ }));
    const data = (await res.json()) as { error?: string };

    expect(res.status).toBe(404);
    expect(data.error).toBe("الطالب غير موجود في حلقتك");
  });

  it("تكرار اليوم (FR-005): 409 DUPLICATE_TODAY بملخّص الورد القائم، ثم نجاح مع confirmDuplicate", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.setSystemTime(new Date(`${today}T12:00:00Z`));
    dbMocks.listSameDayWardStubs.mockResolvedValue([
      {
        id: 99, date: today, recordedVia: "student", status: "new",
        hifz: { from: 603, to: 603 }, hifzAyah: { fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 },
      },
    ]);

    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ }));
    const data = (await res.json()) as { code?: string; existing?: { id: number; recordedVia: string; summary: string } };

    expect(res.status).toBe(409);
    expect(data.code).toBe("DUPLICATE_TODAY");
    expect(data.existing).toMatchObject({ id: 99, recordedVia: "student" });
    expect(data.existing!.summary).toContain("الفيل");
    expect(dbMocks.createApprovedWardLog).not.toHaveBeenCalled();

    const confirm = await POST(postReq({ studentId: "s1", hifz: HIFZ, confirmDuplicate: true }));
    expect(confirm.status).toBe(200);
    expect(dbMocks.createApprovedWardLog).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("رجوع بالتاريخ أكثر من ٣ أيام: 400، وداخل ٣ أيام يمر", async () => {
    const today = new Date().toISOString().slice(0, 10);
    vi.setSystemTime(new Date(`${today}T12:00:00Z`));
    const tooOld = new Date(Date.parse(today) - 5 * 86400000).toISOString().slice(0, 10);
    const ok = new Date(Date.parse(today) - 2 * 86400000).toISOString().slice(0, 10);

    const rejected = await POST(postReq({ studentId: "s1", hifz: HIFZ, date: tooOld }));
    expect(rejected.status).toBe(400);
    expect(dbMocks.createApprovedWardLog).not.toHaveBeenCalled();

    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ, date: ok }));
    expect(res.status).toBe(200);
    expect(dbMocks.createApprovedWardLog.mock.calls[0][2].date).toBe(ok);
    vi.useRealTimers();
  });

  it("بلا حفظ ولا مراجعة ولا ملاحظة: 400", async () => {
    const res = await POST(postReq({ studentId: "s1" }));

    expect(res.status).toBe(400);
    expect(dbMocks.createApprovedWardLog).not.toHaveBeenCalled();
  });

  it("تجاوز حدّ المعدّل (300/ساعة): 429 ولا يُنشأ الورد", async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce(false);

    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ }));

    expect(res.status).toBe(429);
    expect(dbMocks.createApprovedWardLog).not.toHaveBeenCalled();
  });

  it("nextStudentId: أول طالب بلا ورد اليوم بعد الحالي، وnull حين سجّل الجميع", async () => {
    dbMocks.listStudentsWithTodayWard.mockResolvedValue([
      { id: "s1", name: "أحمد", todayWard: null },
      { id: "s2", name: "سعد", todayWard: { id: 9 } },
      { id: "s3", name: "سعيد", todayWard: null },
    ]);
    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ }));
    expect((await res.json()).nextStudentId).toBe("s3");

    dbMocks.listStudentsWithTodayWard.mockResolvedValue([
      { id: "s1", name: "أحمد", todayWard: null },
      { id: "s2", name: "سعد", todayWard: { id: 9 } },
    ]);
    const none = await POST(postReq({ studentId: "s1", hifz: HIFZ }));
    expect((await none.json()).nextStudentId).toBeNull();
  });

  it("غير المسجّل: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);

    expect((await POST(postReq({ studentId: "s1", hifz: HIFZ }))).status).toBe(401);
  });
});

/*
  001 T038 — خلية «الابتدائي + معلّم» من مصفوفة الفئة × المسجِّل (FR-008):
  ورد المعلّم معتمد فوراً (initialStatusFor teacher ⇒ approved عبر
  createApprovedWardLog)؛ بقية الفئات لا تسجيل عن الطالب أصلاً (403)،
  فطلابها يسجّلون بأنفسهم new (اختبار المصفوفة في مسار الطالب).
*/
describe("POST /api/teacher/wards — مصفوفة الفئة × المسجِّل: الابتدائي/معلّم ⇒ معتمد (001 T038)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    authMocks.currentTeacher.mockResolvedValue(TEACHER);
    stageDbMocks.getHalaqahStage.mockResolvedValue("primary");
    dbMocks.getActiveStudentInHalaqah.mockResolvedValue({ id: "s1", name: "أحمد" });
    dbMocks.listSameDayWardStubs.mockResolvedValue([]);
    dbMocks.listStudentsWithTodayWard.mockResolvedValue([]);
    dbMocks.createApprovedWardLog.mockResolvedValue({ id: 55, previousAttemptId: null });
  });

  it("primary + معلّم: معتمد فوراً باسم المعلّم (الحالة الابتدائية approved)", async () => {
    const res = await POST(postReq({ studentId: "s1", hifz: HIFZ }));
    const data = (await res.json()) as { status?: string };

    expect(res.status).toBe(200);
    expect(data?.status).toBe("approved");
    expect(dbMocks.createApprovedWardLog.mock.calls[0][3]).toMatchObject({ recordedVia: "teacher" });
  });

  it.each(["intermediate", "secondary", "university"])(
    "%s + معلّم: لا تسجيل عن الطالب — الابتدائي فقط (FR-003)",
    async (stage) => {
      stageDbMocks.getHalaqahStage.mockResolvedValue(stage);

      const res = await POST(postReq({ studentId: "s1", hifz: HIFZ }));

      expect(res.status).toBe(403);
      expect(dbMocks.createApprovedWardLog).not.toHaveBeenCalled();
    },
  );
});
