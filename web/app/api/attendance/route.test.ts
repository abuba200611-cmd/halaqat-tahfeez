import { beforeEach, describe, expect, it, vi } from "vitest";

const afterMocks = vi.hoisted(() => ({
  after: vi.fn((cb: () => unknown) => {
    afterMocks.lastCallback = cb;
  }),
  lastCallback: undefined as (() => unknown) | undefined,
}));
vi.mock("next/server", () => ({ after: afterMocks.after }));

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  getDayAttendanceData: vi.fn(),
  setAttendance: vi.fn(),
  markAllPresent: vi.fn(),
}));
vi.mock("@/lib/attendance-db", () => dbMocks);

const pushMocks = vi.hoisted(() => ({ sendPushToParentsOfAbsence: vi.fn() }));
vi.mock("@/lib/push", () => pushMocks);

const rateMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "limit" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateMocks);

const { GET, PUT, POST } = await import("./route");

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(new Date());
const tomorrow = new Date(Date.parse(TODAY) + 86400000).toISOString().slice(0, 10);
const yesterday = new Date(Date.parse(TODAY) - 86400000).toISOString().slice(0, 10);

const teacher = (role: "supervisor" | "assistant") => ({ id: 7, halaqahId: 3, role });

const put = (body: unknown) =>
  new Request("http://localhost/api/attendance", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("PUT /api/attendance — التحقق (STEP 62)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    afterMocks.lastCallback = undefined;
    authMocks.currentTeacher.mockResolvedValue(teacher("supervisor"));
    dbMocks.setAttendance.mockResolvedValue({ found: true, previous: null });
  });

  it("بلا جلسة: 401 ولا كتابة", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    const res = await PUT(put({ date: TODAY, studentId: "s1", status: "present" }));
    expect(res.status).toBe(401);
    expect(dbMocks.setAttendance).not.toHaveBeenCalled();
  });

  it("حالة خارج القائمة: 400", async () => {
    for (const status of ["sick", "", undefined, 3]) {
      const res = await PUT(put({ date: TODAY, studentId: "s1", status }));
      expect(res.status).toBe(400);
    }
    expect(dbMocks.setAttendance).not.toHaveBeenCalled();
  });

  it("صيغة تاريخ غير صحيحة أو مستحيلة: 400", async () => {
    for (const date of ["2026-2-3", "2026-02-31", "", undefined, "tomorrow"]) {
      const res = await PUT(put({ date, studentId: "s1", status: "present" }));
      expect(res.status).toBe(400);
    }
    expect(dbMocks.setAttendance).not.toHaveBeenCalled();
  });

  it("تاريخ مستقبلي (غداً بتوقيت الرياض): 400 ولا كتابة", async () => {
    const res = await PUT(put({ date: tomorrow, studentId: "s1", status: "present" }));
    expect(res.status).toBe(400);
    expect(dbMocks.setAttendance).not.toHaveBeenCalled();
  });

  it("طالب مفقود: 400", async () => {
    const res = await PUT(put({ date: TODAY, status: "present" }));
    expect(res.status).toBe(400);
  });

  it("طالب من حلقة أخرى/محذوف/غير فعّال (الاستعلام لا يجد صفاً): 404", async () => {
    dbMocks.setAttendance.mockResolvedValue({ found: false });
    const res = await PUT(put({ date: TODAY, studentId: "foreign", status: "absent" }));
    expect(res.status).toBe(404);
    // الحلقة من الجلسة (3) لا من الجسم
    expect(dbMocks.setAttendance).toHaveBeenCalledWith(3, "foreign", TODAY, "absent", undefined, 7);
    expect(afterMocks.after).not.toHaveBeenCalled();
  });

  it("الحلقة من الجلسة حتى لو أرسل العميل halaqahId", async () => {
    await PUT(put({ date: yesterday, studentId: "s1", status: "late", halaqahId: 99, note: "  زحام  " }));
    expect(dbMocks.setAttendance).toHaveBeenCalledWith(3, "s1", yesterday, "late", "زحام", 7);
  });

  it("المساعد يستطيع التسجيل مثل المشرف", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacher("assistant"));
    const res = await PUT(put({ date: TODAY, studentId: "s1", status: "present" }));
    expect(res.status).toBe(200);
    expect(dbMocks.setAttendance).toHaveBeenCalledWith(3, "s1", TODAY, "present", undefined, 7);
  });

  it("تجاوز حدّ المعدّل: 429", async () => {
    rateMocks.checkRateLimit.mockResolvedValueOnce(false);
    const res = await PUT(put({ date: TODAY, studentId: "s1", status: "present" }));
    expect(res.status).toBe(429);
    expect(dbMocks.setAttendance).not.toHaveBeenCalled();
  });

  it("غياب اليوم لأول مرة: إشعار الأولياء عبر after() ولا يؤثر فشله على الرد", async () => {
    pushMocks.sendPushToParentsOfAbsence.mockRejectedValue(new Error("push down"));
    const res = await PUT(put({ date: TODAY, studentId: "s1", status: "absent" }));
    expect(res.status).toBe(200);
    expect(afterMocks.after).toHaveBeenCalledTimes(1);
    await expect(afterMocks.lastCallback!()).resolves.toBeUndefined();
    expect(pushMocks.sendPushToParentsOfAbsence).toHaveBeenCalledWith(3, "s1");
  });

  it("لا إشعار لو كان غائباً أصلاً، ولا ليوم سابق، ولا لحالة غير الغياب", async () => {
    dbMocks.setAttendance.mockResolvedValue({ found: true, previous: "absent" });
    await PUT(put({ date: TODAY, studentId: "s1", status: "absent" }));
    dbMocks.setAttendance.mockResolvedValue({ found: true, previous: null });
    await PUT(put({ date: yesterday, studentId: "s1", status: "absent" }));
    await PUT(put({ date: TODAY, studentId: "s1", status: "late" }));
    expect(afterMocks.after).not.toHaveBeenCalled();
  });
});

describe("GET /api/attendance — الحضور الضمني والمخزَّن", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(teacher("assistant"));
    dbMocks.getDayAttendanceData.mockResolvedValue({
      students: [
        { id: "a", name: "أحمد" },
        { id: "b", name: "بدر" },
        { id: "c", name: "جاسم" },
      ],
      stored: [{ studentId: "b", status: "absent", note: "سفر" }],
      wardStudentIds: ["a", "b"],
    });
  });

  it("ورد بلا صفّ = حاضر ضمني؛ الصفّ المخزَّن يغلب؛ الباقي غير محدَّد", async () => {
    const res = await GET(new Request(`http://localhost/api/attendance?date=${TODAY}`));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([
      { studentId: "a", name: "أحمد", status: "present", implicit: true, note: "" },
      { studentId: "b", name: "بدر", status: "absent", implicit: false, note: "سفر" },
      { studentId: "c", name: "جاسم", status: null, implicit: false, note: "" },
    ]);
    expect(body.counts).toEqual({ present: 1, late: 0, excused: 0, absent: 1, unmarked: 1 });
    expect(dbMocks.getDayAttendanceData).toHaveBeenCalledWith(3, TODAY);
  });

  it("تاريخ مستقبلي أو غير صحيح: 400 بلا قراءة", async () => {
    expect((await GET(new Request(`http://localhost/api/attendance?date=${tomorrow}`))).status).toBe(400);
    expect((await GET(new Request("http://localhost/api/attendance?date=abc"))).status).toBe(400);
    expect(dbMocks.getDayAttendanceData).not.toHaveBeenCalled();
  });

  it("بلا جلسة: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await GET(new Request("http://localhost/api/attendance"))).status).toBe(401);
  });
});

describe("POST /api/attendance — تحديد الكل حاضر", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(teacher("assistant"));
    dbMocks.markAllPresent.mockResolvedValue(4);
  });

  const post = (body: unknown) =>
    new Request("http://localhost/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("يعمل بحلقة الجلسة", async () => {
    const res = await POST(post({ date: TODAY, action: "markAllPresent" }));
    expect(res.status).toBe(200);
    expect(dbMocks.markAllPresent).toHaveBeenCalledWith(3, TODAY, 7);
  });

  it("يرفض المستقبل والإجراء المجهول", async () => {
    expect((await POST(post({ date: tomorrow, action: "markAllPresent" }))).status).toBe(400);
    expect((await POST(post({ date: TODAY, action: "deleteAll" }))).status).toBe(400);
    expect(dbMocks.markAllPresent).not.toHaveBeenCalled();
  });
});
