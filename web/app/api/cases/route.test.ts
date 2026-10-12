import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const caseMocks = vi.hoisted(() => ({
  listCases: vi.fn(),
  openCase: vi.fn(),
  getLastWardDates: vi.fn(),
  getCase: vi.fn(),
  getRecentWards: vi.fn(),
  listCaseActions: vi.fn(),
  updateCaseFields: vi.fn(),
  addCaseAction: vi.fn(),
  setCaseStatus: vi.fn(),
}));
vi.mock("@/lib/case-db", () => caseMocks);

const planMocks = vi.hoisted(() => ({
  listHalaqahPlans: vi.fn(),
  getMonthActuals: vi.fn(),
  getStudentPlanView: vi.fn(),
}));
vi.mock("@/lib/plan-db", () => planMocks);

const attMocks = vi.hoisted(() => ({ getAttendanceSummaries: vi.fn() }));
vi.mock("@/lib/attendance-db", () => attMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "limit" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

const { GET, POST } = await import("./route");
const { GET: getOne, PATCH } = await import("./[id]/route");
const { POST: addAction } = await import("./[id]/actions/route");
const { POST: setStatus } = await import("./[id]/status/route");

const teacher = { id: 7, halaqahId: 3, role: "supervisor" };
const json = (method: string, body: unknown) =>
  new Request("http://localhost/api/cases", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const allWrites = () =>
  [caseMocks.openCase, caseMocks.updateCaseFields, caseMocks.addCaseAction, caseMocks.setCaseStatus] as const;

beforeEach(() => {
  vi.clearAllMocks();
  authMocks.currentTeacher.mockResolvedValue(teacher);
  rateMocks.checkRateLimit.mockResolvedValue(true);
});

describe("وصول المعلّم فقط (طلاب وأولياء الأمور بلا جلسة معلّم)", () => {
  it("بلا جلسة معلّم: 401 على كل المسارات ولا أي قراءة أو كتابة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    const responses = [
      await GET(),
      await POST(json("POST", { studentId: "s1" })),
      await getOne(new Request("http://localhost/api/cases/1"), ctx("1")),
      await PATCH(json("PATCH", { diagnosis: "x" }), ctx("1")),
      await addAction(json("POST", { action: "x" }), ctx("1")),
      await setStatus(json("POST", { status: "closed" }), ctx("1")),
    ];
    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    for (const fn of [...Object.values(caseMocks), ...Object.values(planMocks), ...Object.values(attMocks)]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("المساعد كالمشرف", async () => {
    authMocks.currentTeacher.mockResolvedValue({ ...teacher, role: "assistant" });
    caseMocks.openCase.mockResolvedValue({ kind: "created", id: 5 });
    expect((await POST(json("POST", { studentId: "s1" }))).status).toBe(201);
  });
});

describe("GET /api/cases", () => {
  it("يعيد الحالات والترشيحات (من لا حالة مفتوحة له فقط) لحلقة الجلسة", async () => {
    caseMocks.listCases.mockResolvedValue([
      { id: 1, studentId: "s1", studentName: "أحمد", status: "open", openedAt: "x", closedAt: null, lastActionDate: null },
    ]);
    planMocks.listHalaqahPlans.mockResolvedValue([
      { studentId: "s1", name: "أحمد", plan: null },
      { studentId: "s2", name: "خالد", plan: null },
    ]);
    planMocks.getMonthActuals.mockResolvedValue({});
    attMocks.getAttendanceSummaries.mockResolvedValue({ s2: { days: 10, present: 3, late: 0, excused: 0, absent: 7, presentPct: 30 } });
    caseMocks.getLastWardDates.mockResolvedValue({});

    const res = await GET();
    expect(res.status).toBe(200);
    expect(caseMocks.listCases).toHaveBeenCalledWith(3);
    expect(planMocks.listHalaqahPlans).toHaveBeenCalledWith(3, expect.any(String));
    const body = await res.json();
    expect(body.cases).toHaveLength(1);
    expect(body.suggestions.map((s: { studentId: string }) => s.studentId)).toEqual(["s2"]);
    expect(body.suggestions[0].reasons).toEqual(["low_attendance", "no_ward"]);
  });
});

describe("POST /api/cases (فتح حالة)", () => {
  it("يفتح الحالة ويمرّر حلقة الجلسة دائماً ولو أرسل العميل halaqahId", async () => {
    caseMocks.openCase.mockResolvedValue({ kind: "created", id: 9 });
    const res = await POST(json("POST", { studentId: "s1", halaqahId: 99 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true, id: 9 });
    expect(caseMocks.openCase).toHaveBeenCalledWith(3, "s1", 7);
  });

  it("قاعدة حالة واحدة مفتوحة: 409 مع معرّف الحالة القائمة", async () => {
    caseMocks.openCase.mockResolvedValue({ kind: "exists", id: 4 });
    const res = await POST(json("POST", { studentId: "s1" }));
    expect(res.status).toBe(409);
    expect((await res.json()).caseId).toBe(4);
  });

  it("طالب أجنبي/محذوف/غير فعّال: 404", async () => {
    caseMocks.openCase.mockResolvedValue({ kind: "not_found" });
    expect((await POST(json("POST", { studentId: "foreign" }))).status).toBe(404);
  });

  it("studentId مفقود أو غير نصي: 400 ولا كتابة", async () => {
    expect((await POST(json("POST", {}))).status).toBe(400);
    expect((await POST(json("POST", { studentId: 1 }))).status).toBe(400);
    expect(caseMocks.openCase).not.toHaveBeenCalled();
  });

  it("تجاوز الحدّ: 429", async () => {
    rateMocks.checkRateLimit.mockResolvedValueOnce(false);
    expect((await POST(json("POST", { studentId: "s1" }))).status).toBe(429);
    expect(caseMocks.openCase).not.toHaveBeenCalled();
  });
});

describe("GET /api/cases/[id]", () => {
  it("حالة حلقة أخرى (getCase يرجع null): 404 ولا سياق", async () => {
    caseMocks.getCase.mockResolvedValue(null);
    const res = await getOne(new Request("http://localhost/api/cases/8"), ctx("8"));
    expect(res.status).toBe(404);
    expect(caseMocks.getCase).toHaveBeenCalledWith(3, 8);
    expect(caseMocks.listCaseActions).not.toHaveBeenCalled();
    expect(planMocks.getStudentPlanView).not.toHaveBeenCalled();
  });

  it("معرّف غير صالح: 404 بلا استعلام", async () => {
    for (const id of ["abc", "0", "-3", "1.5"]) {
      expect((await getOne(new Request("http://localhost/x"), ctx(id))).status).toBe(404);
    }
    expect(caseMocks.getCase).not.toHaveBeenCalled();
  });

  it("يعيد الحالة مع السياق بنطاق الحلقة والطالب", async () => {
    caseMocks.getCase.mockResolvedValue({ id: 8, studentId: "s1", studentName: "أحمد", status: "open" });
    caseMocks.listCaseActions.mockResolvedValue([]);
    attMocks.getAttendanceSummaries.mockResolvedValue({ s1: { days: 5, present: 5, late: 0, excused: 0, absent: 0, presentPct: 100 } });
    planMocks.getStudentPlanView.mockResolvedValue({ month: "m" });
    caseMocks.getRecentWards.mockResolvedValue([]);
    const res = await getOne(new Request("http://localhost/x"), ctx("8"));
    expect(res.status).toBe(200);
    expect(attMocks.getAttendanceSummaries).toHaveBeenCalledWith(3, expect.any(String), "s1");
    expect(planMocks.getStudentPlanView).toHaveBeenCalledWith(3, "s1", expect.any(String), expect.any(String));
    expect(caseMocks.getRecentWards).toHaveBeenCalledWith(3, "s1", 5);
    expect((await res.json()).context.attendance.presentPct).toBe(100);
  });
});

describe("PATCH /api/cases/[id]", () => {
  it("يحفظ الحقول بنطاق حلقة الجلسة", async () => {
    caseMocks.updateCaseFields.mockResolvedValue(true);
    const res = await PATCH(json("PATCH", { diagnosis: "ضعف تركيز", halaqahId: 99 }), ctx("8"));
    expect(res.status).toBe(200);
    expect(caseMocks.updateCaseFields).toHaveBeenCalledWith(3, 8, { diagnosis: "ضعف تركيز" });
  });

  it("حقل أطول من ٢٠٠٠ حرف: 400 ولا كتابة", async () => {
    const res = await PATCH(json("PATCH", { plan: "x".repeat(2001) }), ctx("8"));
    expect(res.status).toBe(400);
    expect(caseMocks.updateCaseFields).not.toHaveBeenCalled();
  });

  it("حالة حلقة أخرى: 404", async () => {
    caseMocks.updateCaseFields.mockResolvedValue(false);
    expect((await PATCH(json("PATCH", { plan: "x" }), ctx("8"))).status).toBe(404);
  });
});

describe("POST /api/cases/[id]/actions", () => {
  it("يضيف إجراءً (التاريخ الافتراضي اليوم)", async () => {
    caseMocks.addCaseAction.mockResolvedValue({ id: 1, actionDate: "d", action: "اتصال", result: null, createdAt: "t" });
    const res = await addAction(json("POST", { action: "اتصال" }), ctx("8"));
    expect(res.status).toBe(201);
    expect(caseMocks.addCaseAction).toHaveBeenCalledWith(3, 8, 7, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "اتصال", null);
  });

  it("تحقّق: فارغ/طويل/تاريخ سيئ = 400 ولا كتابة", async () => {
    expect((await addAction(json("POST", { action: " " }), ctx("8"))).status).toBe(400);
    expect((await addAction(json("POST", { action: "x".repeat(2001) }), ctx("8"))).status).toBe(400);
    expect((await addAction(json("POST", { action: "a", actionDate: "bad" }), ctx("8"))).status).toBe(400);
    expect(caseMocks.addCaseAction).not.toHaveBeenCalled();
  });

  it("حالة حلقة أخرى: 404", async () => {
    caseMocks.addCaseAction.mockResolvedValue(null);
    expect((await addAction(json("POST", { action: "a" }), ctx("8"))).status).toBe(404);
  });
});

describe("POST /api/cases/[id]/status", () => {
  it("إغلاق وإعادة فتح", async () => {
    caseMocks.setCaseStatus.mockResolvedValue({ kind: "ok" });
    expect((await setStatus(json("POST", { status: "closed" }), ctx("8"))).status).toBe(200);
    expect(caseMocks.setCaseStatus).toHaveBeenCalledWith(3, 8, "closed");
  });

  it("إعادة فتح مع حالة مفتوحة أخرى: 409", async () => {
    caseMocks.setCaseStatus.mockResolvedValue({ kind: "conflict", openCaseId: 11 });
    const res = await setStatus(json("POST", { status: "open" }), ctx("8"));
    expect(res.status).toBe(409);
    expect((await res.json()).caseId).toBe(11);
  });

  it("حالة حلقة أخرى: 404، وحالة غير صالحة: 400", async () => {
    caseMocks.setCaseStatus.mockResolvedValue({ kind: "not_found" });
    expect((await setStatus(json("POST", { status: "closed" }), ctx("8"))).status).toBe(404);
    expect((await setStatus(json("POST", { status: "zzz" }), ctx("8"))).status).toBe(400);
  });
});

it("لا كتابة عند معرّف غير صالح", async () => {
  for (const id of ["x", "0"]) {
    expect((await PATCH(json("PATCH", { plan: "a" }), ctx(id))).status).toBe(404);
    expect((await addAction(json("POST", { action: "a" }), ctx(id))).status).toBe(404);
    expect((await setStatus(json("POST", { status: "closed" }), ctx(id))).status).toBe(404);
  }
  for (const fn of allWrites()) expect(fn).not.toHaveBeenCalled();
});
