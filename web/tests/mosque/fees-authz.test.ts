import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  الرسوم والاشتراكات — الصلاحيات خادمياً بلا IDOR: مدير الجامع لجامعه فقط
  (جامع آخر 401، ومعرّف مستحق/خطة/حلقة من جامع آخر لا يصل لأن كل استدعاء بيانات
  يُمرَّر له جامع المسار لا جسم الطلب)، وولي الأمر لأبنائه المرتبطين فقط
  (لا يُقبل أي معرّف من العميل)، والمعلّم لحلقته من جلسته فقط. featureGate حقيقي.
*/

const state = vi.hoisted(() => ({
  adminMosqueId: 5 as number | null, // مدير الجامع المسجّل (جامعه)
  featureOn: true,
  rateOk: true,
  teacher: { id: 1, halaqahId: 9 } as { id: number; halaqahId: number } | null,
  parent: { id: 70 } as { id: number } | null,
}));

vi.mock("@/lib/mosque/admin-auth", () => ({
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
  isAdmin: vi.fn(async () => false),
}));
vi.mock("@/lib/mosque/access", () => ({
  canAccessMosque: vi.fn(async (mosqueId: number) => state.adminMosqueId === mosqueId),
}));
vi.mock("@/lib/mosque/actor", () => ({
  currentMosqueActor: vi.fn(async () => ({ kind: "mosque_admin", id: 3, label: "مدير الجامع" })),
}));
vi.mock("@/lib/mosque/db", () => ({
  isFeatureEnabled: vi.fn(async () => state.featureOn),
  getMosque: vi.fn(async (id: number) => ({ id, name: `جامع ${id}`, city: "", createdAt: "" })),
  getHalaqah: vi.fn(async (id: number) => ({ id, mosqueId: id === 9 ? 5 : 6, halaqahName: "ح", teacherName: "", createdAt: "" })),
}));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => state.rateOk),
  rateLimited: vi.fn(() => new Response("429", { status: 429 })),
}));
vi.mock("@/lib/auth", () => ({
  currentTeacher: vi.fn(async () => state.teacher),
  unauthorized: () => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 }),
}));
vi.mock("@/lib/parent-auth", () => ({
  currentParent: vi.fn(async () => state.parent),
  parentUnauthorized: () => Response.json({ error: "x" }, { status: 401 }),
}));
vi.mock("@/lib/parent-db", () => ({
  listParentChildren: vi.fn(async () => [
    { halaqahId: 9, studentId: "s1", studentName: "ابني", halaqahName: "ح٩" },
    { halaqahId: 10, studentId: "s2", studentName: "ابني٢", halaqahName: "ح١٠" },
  ]),
}));

const feesDb = vi.hoisted(() => ({
  listPlans: vi.fn(async () => []),
  listFees: vi.fn(async () => ({ fees: [], totals: { dueCents: 0, collectedCents: 0, outstandingCents: 0 } })),
  generateDues: vi.fn(async () => ({ ok: true, eligible: 2, created: 2, skipped: 0 })),
  createPlan: vi.fn(async () => ({ id: 1 })),
  updatePlan: vi.fn(async () => null),
  getFeeForMosque: vi.fn(async () => null),
  listPaymentsForFee: vi.fn(async () => []),
  recordPayment: vi.fn(async () => ({ ok: false, status: 404, error: "المستحق غير موجود" })),
  waiveFee: vi.fn(async () => ({ ok: false, status: 404, error: "المستحق غير موجود" })),
  getMosqueIdForHalaqah: vi.fn(async (id: number) => (id === 9 ? 5 : 6)),
  listFeesForStudent: vi.fn(async (halaqahId: number, studentId: string) => [
    {
      id: 1,
      mosqueId: 5,
      halaqahId,
      halaqahName: "",
      studentId,
      studentName: "",
      planId: 1,
      planName: "شهري",
      periodLabel: "2026-10",
      amountDueCents: 5000,
      amountPaidCents: 0,
      status: "due",
      dueDate: null,
      notes: "ملاحظة داخلية",
      payments: [],
    },
  ]),
  latestFeeStatusByStudent: vi.fn(async () => ({ s1: { status: "paid", periodLabel: "2026-10" } })),
}));
vi.mock("@/lib/fees-db", () => feesDb);

const list = await import("@/app/api/mosques/[id]/fees/route");
const plans = await import("@/app/api/mosques/[id]/fees/plans/route");
const planOne = await import("@/app/api/mosques/[id]/fees/plans/[planId]/route");
const detail = await import("@/app/api/mosques/[id]/fees/[feeId]/route");
const payments = await import("@/app/api/mosques/[id]/fees/[feeId]/payments/route");
const waive = await import("@/app/api/mosques/[id]/fees/[feeId]/waive/route");
const exportCsv = await import("@/app/api/mosques/[id]/fees/export/route");
const parentFees = await import("@/app/api/parent/fees/route");
const teacherFees = await import("@/app/api/teacher/fees/route");

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const ctx2 = (id: string, feeId: string) => ({ params: Promise.resolve({ id, feeId }) });
const req = (body?: unknown, method = "GET", url = "http://localhost/x") =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.adminMosqueId = 5;
  state.featureOn = true;
  state.rateOk = true;
  state.teacher = { id: 1, halaqahId: 9 };
  state.parent = { id: 70 };
});

describe("مدير الجامع — جامعه فقط", () => {
  it("جامع آخر: 401 على كل المسارات بلا أي قراءة أو كتابة", async () => {
    const responses = [
      await list.GET(req(), ctx("6")),
      await list.POST(req({ planId: 1, periodLabel: "2026-10", halaqahIds: [9] }, "POST"), ctx("6")),
      await plans.POST(req({ name: "x", amount: "5", period: "monthly" }, "POST"), ctx("6")),
      await planOne.PATCH(req({ active: false }, "PATCH"), { params: Promise.resolve({ id: "6", planId: "1" }) }),
      await detail.GET(req(), ctx2("6", "7")),
      await payments.POST(req({ amount: "5" }, "POST"), ctx2("6", "7")),
      await waive.POST(req(undefined, "POST"), ctx2("6", "7")),
      await exportCsv.GET(req(), ctx("6")),
    ];
    for (const res of responses) expect(res.status).toBe(401);
    for (const fn of Object.values(feesDb)) expect(fn).not.toHaveBeenCalled();
  });

  it("غير مسجّل أصلاً: 401", async () => {
    state.adminMosqueId = null;
    expect((await list.GET(req(), ctx("5"))).status).toBe(401);
    expect((await payments.POST(req({ amount: "5" }, "POST"), ctx2("5", "7"))).status).toBe(401);
  });

  it("الميزة معطّلة: 404 قبل أي قراءة أو كتابة", async () => {
    state.featureOn = false;
    const responses = [
      await list.GET(req(), ctx("5")),
      await list.POST(req({ planId: 1, periodLabel: "2026-10", halaqahIds: [9] }, "POST"), ctx("5")),
      await payments.POST(req({ amount: "5" }, "POST"), ctx2("5", "7")),
      await exportCsv.GET(req(), ctx("5")),
    ];
    for (const res of responses) expect(res.status).toBe(404);
    for (const fn of Object.values(feesDb)) expect(fn).not.toHaveBeenCalled();
  });

  it("معرّفات المسار غير الرقمية: 404", async () => {
    expect((await list.GET(req(), ctx("abc"))).status).toBe(404);
    expect((await payments.POST(req({ amount: "5" }, "POST"), ctx2("5", "1;DROP"))).status).toBe(404);
    expect((await waive.POST(req(undefined, "POST"), ctx2("5", "0"))).status).toBe(404);
  });

  it("مستحق جامع آخر بمعرّفه: الدفع والإعفاء والتفاصيل تُمرَّر بجامع المسار (٥) لا بما في الجسم → 404", async () => {
    const pay = await payments.POST(req({ amount: "5", mosqueId: 6 }, "POST"), ctx2("5", "77"));
    expect(pay.status).toBe(404);
    expect(feesDb.recordPayment).toHaveBeenCalledWith(expect.objectContaining({ mosqueId: 5, feeId: 77 }));

    expect((await waive.POST(req(undefined, "POST"), ctx2("5", "77"))).status).toBe(404);
    expect(feesDb.waiveFee).toHaveBeenCalledWith(5, 77);

    expect((await detail.GET(req(), ctx2("5", "77"))).status).toBe(404);
    expect(feesDb.getFeeForMosque).toHaveBeenCalledWith(5, 77);
  });

  it("توليد المستحقات يمرّر جامع المسار، وحلقة من جامع آخر يردّها الخادم 404", async () => {
    feesDb.generateDues.mockResolvedValueOnce({ ok: false, status: 404, error: "إحدى الحلقات ليست من هذا الجامع" } as never);
    const res = await list.POST(req({ planId: 2, periodLabel: "2026-10", halaqahIds: [10], mosqueId: 6 }, "POST"), ctx("5"));
    expect(res.status).toBe(404);
    expect(feesDb.generateDues).toHaveBeenCalledWith(expect.objectContaining({ mosqueId: 5, halaqahIds: [10] }));
  });

  it("تعديل خطة جامع آخر: 404 والاستدعاء بجامع المسار؛ والدورية غير قابلة للتعديل", async () => {
    const res = await planOne.PATCH(req({ active: false }, "PATCH"), { params: Promise.resolve({ id: "5", planId: "88" }) });
    expect(res.status).toBe(404);
    expect(feesDb.updatePlan).toHaveBeenCalledWith(5, 88, expect.objectContaining({ active: false }));

    const period = await planOne.PATCH(req({ period: "yearly" }, "PATCH"), { params: Promise.resolve({ id: "5", planId: "88" }) });
    expect(period.status).toBe(400);
  });

  it("الكتابات محدودة المعدّل: تجاوز الحد = 429 بلا كتابة", async () => {
    state.rateOk = false;
    expect((await list.POST(req({ planId: 1, periodLabel: "2026-10", halaqahIds: [9] }, "POST"), ctx("5"))).status).toBe(429);
    expect((await plans.POST(req({ name: "x", amount: "5", period: "monthly" }, "POST"), ctx("5"))).status).toBe(429);
    expect((await payments.POST(req({ amount: "5" }, "POST"), ctx2("5", "7"))).status).toBe(429);
    expect((await waive.POST(req(undefined, "POST"), ctx2("5", "7"))).status).toBe(429);
    expect(feesDb.generateDues).not.toHaveBeenCalled();
    expect(feesDb.createPlan).not.toHaveBeenCalled();
    expect(feesDb.recordPayment).not.toHaveBeenCalled();
    expect(feesDb.waiveFee).not.toHaveBeenCalled();
  });

  it("مدخلات سيئة: 400 قبل الحدّ والكتابة (مبلغ زائد الدقة / سالب)", async () => {
    expect((await payments.POST(req({ amount: "1.234" }, "POST"), ctx2("5", "7"))).status).toBe(400);
    expect((await payments.POST(req({ amount: "-5" }, "POST"), ctx2("5", "7"))).status).toBe(400);
    expect((await plans.POST(req({ name: "x", amount: "abc", period: "monthly" }, "POST"), ctx("5"))).status).toBe(400);
    expect(feesDb.recordPayment).not.toHaveBeenCalled();
  });

  it("تصدير CSV: ملف نصي بـBOM وبمرشّحات جامع المسار", async () => {
    const res = await exportCsv.GET(req(undefined, "GET", "http://localhost/x?status=due&halaqah=9"), ctx("5"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM لفتح العربية بإكسل
    expect(feesDb.listFees).toHaveBeenCalledWith(5, expect.objectContaining({ status: "due", halaqahId: 9 }));
  });
});

describe("ولي الأمر — أبناؤه المرتبطون فقط", () => {
  it("غير مسجّل: 401", async () => {
    state.parent = null;
    expect((await parentFees.GET(req())).status).toBe(401);
  });

  it("يستعلم لأبنائه فقط، ويتجاهل أي معرّف في الرابط (طالب غيره لا يصل)", async () => {
    const res = await parentFees.GET(req(undefined, "GET", "http://localhost/x?halaqah=10&student=victim"));
    const body = (await res.json()) as { children: { studentId: string }[] };
    // ابن الحلقة ١٠ جامعها ٦ (غير الجامع المفعّل بالمحاكاة؟ كلاهما مفعّل) — النتيجة من جدول الربط حصراً
    expect(body.children.map((c) => c.studentId).sort()).toEqual(["s1", "s2"]);
    const calls = feesDb.listFeesForStudent.mock.calls.map((c) => `${c[0]}:${c[1]}`).sort();
    expect(calls).toEqual(["10:s2", "9:s1"]);
    expect(calls).not.toContain("10:victim");
  });

  it("ابن في جامع لم تُفعَّل فيه الميزة لا يظهر ولا يُقرأ له شيء", async () => {
    const { isFeatureEnabled } = await import("@/lib/mosque/db");
    vi.mocked(isFeatureEnabled).mockImplementation(async (mosqueId: number) => mosqueId === 5);
    const body = (await (await parentFees.GET(req())).json()) as { enabled: boolean; children: { studentId: string }[] };
    expect(body.children.map((c) => c.studentId)).toEqual(["s1"]);
    expect(feesDb.listFeesForStudent).toHaveBeenCalledTimes(1);
    vi.mocked(isFeatureEnabled).mockImplementation(async () => state.featureOn);
  });

  it("الميزة معطّلة لكل الأبناء: enabled=false وبلا أي قراءة رسوم", async () => {
    state.featureOn = false;
    const body = (await (await parentFees.GET(req(undefined, "GET", "http://localhost/x?check=1"))).json()) as { enabled: boolean };
    expect(body).toEqual({ enabled: false });
    expect(feesDb.listFeesForStudent).not.toHaveBeenCalled();
  });

  it("ملاحظات الإدارة الداخلية ومعرّف الجامع لا يصلان الولي", async () => {
    const body = (await (await parentFees.GET(req())).json()) as { children: { fees: Record<string, unknown>[] }[] };
    const fee = body.children[0].fees[0];
    expect(fee).not.toHaveProperty("notes");
    expect(fee).not.toHaveProperty("mosqueId");
    expect(fee).toMatchObject({ planName: "شهري", amountDueCents: 5000 });
  });
});

describe("المعلّم — حلقته من جلسته فقط", () => {
  it("غير مسجّل: 401", async () => {
    state.teacher = null;
    expect((await teacherFees.GET()).status).toBe(401);
  });

  it("يقرأ حالة حلقته (٩) فقط — لا يوجد معامل حلقة يُقبل من العميل", async () => {
    const body = (await (await teacherFees.GET()).json()) as { enabled: boolean; statuses: Record<string, unknown> };
    expect(body.enabled).toBe(true);
    expect(body.statuses).toEqual({ s1: { status: "paid", periodLabel: "2026-10" } });
    expect(feesDb.latestFeeStatusByStudent).toHaveBeenCalledTimes(1);
    expect(feesDb.latestFeeStatusByStudent).toHaveBeenCalledWith(9);
  });

  it("معلّم حلقة أخرى (١٠) يقرأ حلقته هو فقط", async () => {
    state.teacher = { id: 2, halaqahId: 10 };
    await teacherFees.GET();
    expect(feesDb.latestFeeStatusByStudent).toHaveBeenCalledWith(10);
    expect(feesDb.latestFeeStatusByStudent).not.toHaveBeenCalledWith(9);
  });

  it("الميزة معطّلة لجامع الحلقة: enabled=false بلا بيانات", async () => {
    state.featureOn = false;
    const body = (await (await teacherFees.GET()).json()) as { enabled: boolean; statuses: Record<string, unknown> };
    expect(body).toEqual({ enabled: false, statuses: {} });
    expect(feesDb.latestFeeStatusByStudent).not.toHaveBeenCalled();
  });
});
