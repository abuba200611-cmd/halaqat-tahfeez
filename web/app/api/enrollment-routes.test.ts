import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  صلاحيات مسارات التوزيع الآلي والاستيراد: لا كتابة بلا جلسة/ميزة، معرّف الجامع يأتي من
  المسار المُحقَّق (مدير) أو من جلسة المعلّم (لا من العميل)، المعلّم يستورد لحلقته فقط،
  حدّ المعدّل يسبق أي عمل، وحدود الملف (الحجم/الامتداد/البصمة) تُفرض على الخادم.
*/

const mocks = vi.hoisted(() => ({
  featureGate: vi.fn(),
  currentTeacher: vi.fn(),
  guardImpersonation: vi.fn(),
  checkRateLimit: vi.fn(),
  commitImport: vi.fn(),
  previewImport: vi.fn(),
  importMosqueForHalaqah: vi.fn(),
  moveWaitlistEntry: vi.fn(),
  removeWaitlistEntry: vi.fn(),
  updateHalaqahCriteria: vi.fn(),
  getEnrollmentOverview: vi.fn(),
}));

const unauthorizedResponse = () => Response.json({ error: "غير مصرّح" }, { status: 401 });

vi.mock("@/lib/mosque/api-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mosque/api-gate")>()),
  featureGate: mocks.featureGate,
}));
vi.mock("@/lib/mosque/actor", () => ({
  currentMosqueActor: async () => ({ kind: "mosque_admin", id: 1, label: "مدير الجامع" }),
}));
vi.mock("@/lib/auth", () => ({
  currentTeacher: mocks.currentTeacher,
  unauthorized: () => Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 }),
}));
vi.mock("@/lib/dev-impersonation", () => ({ guardImpersonation: mocks.guardImpersonation }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimited: () => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 }),
}));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: async () => {} }));
vi.mock("@/lib/mosque/enrollment-db", () => ({
  AUTO_ASSIGN_KEY: "auto_assign",
  IMPORT_KEY: "student_import",
  commitImport: mocks.commitImport,
  previewImport: mocks.previewImport,
  importMosqueForHalaqah: mocks.importMosqueForHalaqah,
  moveWaitlistEntry: mocks.moveWaitlistEntry,
  removeWaitlistEntry: mocks.removeWaitlistEntry,
  updateHalaqahCriteria: mocks.updateHalaqahCriteria,
  getEnrollmentOverview: mocks.getEnrollmentOverview,
  autoAssignPending: vi.fn(),
  markActivityRead: vi.fn(),
}));

const teacherImport = await import("@/app/api/teacher/import/route");
const mosqueImport = await import("@/app/api/mosques/[id]/import/route");
const waitlist = await import("@/app/api/mosques/[id]/waitlist/[registrationId]/route");
const criteria = await import("@/app/api/mosques/[id]/enrollment/halaqahs/[halaqahId]/route");
const overview = await import("@/app/api/mosques/[id]/enrollment/route");

const TEACHER = { id: 1, halaqahId: 7, role: "supervisor" as const };
const CSV = "الاسم,الجوال\nأحمد,0501234567\n";

function importRequest(opts: { mode?: string; file?: File | null; extra?: Record<string, string> } = {}): Request {
  const form = new FormData();
  if (opts.file !== null) form.set("file", opts.file ?? new File([CSV], "students.csv", { type: "text/csv" }));
  form.set("mode", opts.mode ?? "commit");
  for (const [key, value] of Object.entries(opts.extra ?? {})) form.set(key, value);
  return new Request("http://localhost/api/import", { method: "POST", body: form });
}

const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });
const jsonRequest = (body: unknown, method = "POST") =>
  new Request("http://localhost/x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const commitResult = { rows: [], summary: { total: 1, valid: 1, errors: 0, duplicates: 0 }, created: 1, skipped: 0, autoAssigned: 0, waitlisted: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.featureGate.mockResolvedValue(null);
  mocks.currentTeacher.mockResolvedValue(TEACHER);
  mocks.guardImpersonation.mockResolvedValue(null);
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.importMosqueForHalaqah.mockResolvedValue(5);
  mocks.commitImport.mockResolvedValue(commitResult);
  mocks.previewImport.mockResolvedValue(commitResult);
  mocks.moveWaitlistEntry.mockResolvedValue("moved");
  mocks.removeWaitlistEntry.mockResolvedValue(true);
  mocks.updateHalaqahCriteria.mockResolvedValue({ promoted: 0 });
  mocks.getEnrollmentOverview.mockResolvedValue({ halaqahs: [], waitlist: [], activity: [], unread: 0 });
});

describe("استيراد المعلّم (POST /api/teacher/import)", () => {
  it("بلا جلسة ← 401 ولا عمل", async () => {
    mocks.currentTeacher.mockResolvedValue(null);
    const res = await teacherImport.POST(importRequest());
    expect(res.status).toBe(401);
    expect(mocks.commitImport).not.toHaveBeenCalled();
    expect(mocks.importMosqueForHalaqah).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة لجامع حلقته ← 404", async () => {
    mocks.importMosqueForHalaqah.mockResolvedValue(null);
    const res = await teacherImport.POST(importRequest());
    expect(res.status).toBe(404);
    expect(mocks.commitImport).not.toHaveBeenCalled();
  });

  it("«عرض كـ» يحجب الكتابة", async () => {
    mocks.guardImpersonation.mockResolvedValue(Response.json({ error: "محجوب" }, { status: 403 }));
    const res = await teacherImport.POST(importRequest());
    expect(res.status).toBe(403);
    expect(mocks.commitImport).not.toHaveBeenCalled();
  });

  it("النطاق من الجلسة: حلقة المعلّم وجامعها، ولو أرسل العميل معرّفات أخرى", async () => {
    const res = await teacherImport.POST(importRequest({ extra: { halaqahId: "999", mosqueId: "123" } }));
    expect(res.status).toBe(200);
    expect(mocks.importMosqueForHalaqah).toHaveBeenCalledWith(7);
    const [mosqueId, scope] = mocks.commitImport.mock.calls[0];
    expect(mosqueId).toBe(5);
    expect(scope).toEqual({ kind: "teacher", halaqahId: 7 });
  });

  it("المعاينة لا تكتب", async () => {
    const res = await teacherImport.POST(importRequest({ mode: "preview" }));
    expect(res.status).toBe(200);
    expect(mocks.previewImport).toHaveBeenCalledTimes(1);
    expect(mocks.commitImport).not.toHaveBeenCalled();
  });

  it("تجاوز حدّ المعدّل ← 429 قبل قراءة الملف أو الكتابة", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    const res = await teacherImport.POST(importRequest());
    expect(res.status).toBe(429);
    expect(mocks.commitImport).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit.mock.calls[0][0]).toContain("teacher:7");
  });

  it("ملف أكبر من ٢ ميغابايت ← 413", async () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.csv");
    const res = await teacherImport.POST(importRequest({ file: big }));
    expect(res.status).toBe(413);
    expect(mocks.commitImport).not.toHaveBeenCalled();
  });

  it("امتداد غير مدعوم، و«xlsx» مزيّف ليس zip ← 400", async () => {
    expect((await teacherImport.POST(importRequest({ file: new File(["x"], "a.xls") }))).status).toBe(400);
    expect((await teacherImport.POST(importRequest({ file: new File(["not a zip"], "a.xlsx") }))).status).toBe(400);
    expect(mocks.commitImport).not.toHaveBeenCalled();
  });

  it("بلا ملف، أو CSV أكثر من ١٠٠٠ صف ← خطأ دون كتابة", async () => {
    expect((await teacherImport.POST(importRequest({ file: null }))).status).toBe(400);
    const rows = Array.from({ length: 1001 }, (_, i) => `طالب ${i}`).join("\n");
    const res = await teacherImport.POST(importRequest({ file: new File([`الاسم\n${rows}`], "many.csv") }));
    expect(res.status).toBe(422);
    expect(mocks.commitImport).not.toHaveBeenCalled();
  });
});

describe("استيراد مدير الجامع (/api/mosques/[id]/import)", () => {
  it("فشل البوابة (401/404) يمرّ كما هو بلا عمل", async () => {
    mocks.featureGate.mockResolvedValue(unauthorizedResponse());
    const res = await mosqueImport.POST(importRequest(), params({ id: "5" }));
    expect(res.status).toBe(401);
    expect(mocks.commitImport).not.toHaveBeenCalled();
  });

  it("معرّف الجامع غير رقمي ← 404 قبل البوابة", async () => {
    const res = await mosqueImport.POST(importRequest(), params({ id: "5abc" }));
    expect(res.status).toBe(404);
    expect(mocks.featureGate).not.toHaveBeenCalled();
  });

  it("النطاق مدير والجامع من المسار المُحقَّق", async () => {
    await mosqueImport.POST(importRequest(), params({ id: "5" }));
    expect(mocks.featureGate).toHaveBeenCalledWith(5, "student_import");
    expect(mocks.commitImport.mock.calls[0][0]).toBe(5);
    expect(mocks.commitImport.mock.calls[0][1]).toEqual({ kind: "admin" });
  });
});

describe("قائمة الانتظار والسعة (مدير الجامع)", () => {
  it("كل المسارات خلف بوابة ميزة التوزيع الآلي وبلا بوابة لا يُمسّ شيء", async () => {
    mocks.featureGate.mockResolvedValue(unauthorizedResponse());
    expect((await overview.GET(new Request("http://x"), params({ id: "5" }))).status).toBe(401);
    expect((await waitlist.POST(jsonRequest({ action: "move", direction: "up" }), params({ id: "5", registrationId: "3" }))).status).toBe(401);
    expect((await waitlist.DELETE(new Request("http://x", { method: "DELETE" }), params({ id: "5", registrationId: "3" }))).status).toBe(401);
    expect((await criteria.PUT(jsonRequest({ capacity: 5 }, "PUT"), params({ id: "5", halaqahId: "3" }))).status).toBe(401);
    expect(mocks.featureGate).toHaveBeenCalledWith(5, "auto_assign");
    expect(mocks.moveWaitlistEntry).not.toHaveBeenCalled();
    expect(mocks.removeWaitlistEntry).not.toHaveBeenCalled();
    expect(mocks.updateHalaqahCriteria).not.toHaveBeenCalled();
    expect(mocks.getEnrollmentOverview).not.toHaveBeenCalled();
  });

  it("التحريك والإزالة تُمرَّر بجامع المسار لا بجامع من الجسم (لا IDOR)", async () => {
    await waitlist.POST(jsonRequest({ action: "move", direction: "down", mosqueId: 999 }), params({ id: "5", registrationId: "3" }));
    expect(mocks.moveWaitlistEntry).toHaveBeenCalledWith(5, 3, "down");
    await waitlist.DELETE(new Request("http://x", { method: "DELETE" }), params({ id: "5", registrationId: "3" }));
    expect(mocks.removeWaitlistEntry).toHaveBeenCalledWith(5, 3);
  });

  it("منتظر غير موجود بجامعه ← 404", async () => {
    mocks.removeWaitlistEntry.mockResolvedValue(false);
    const res = await waitlist.DELETE(new Request("http://x", { method: "DELETE" }), params({ id: "5", registrationId: "3" }));
    expect(res.status).toBe(404);
  });

  it("معرّفات مسار غير صالحة ← 404 ، وإجراء مجهول ← 400", async () => {
    expect((await waitlist.POST(jsonRequest({ action: "move", direction: "up" }), params({ id: "5", registrationId: "0" }))).status).toBe(404);
    expect((await waitlist.POST(jsonRequest({ action: "delete" }), params({ id: "5", registrationId: "3" }))).status).toBe(400);
    expect((await waitlist.POST(jsonRequest({ action: "move", direction: "sideways" }), params({ id: "5", registrationId: "3" }))).status).toBe(400);
  });

  it("تحرير السعة: تحقق من المدخلات وتقييد الحلقة بالجامع", async () => {
    expect((await criteria.PUT(jsonRequest({ capacity: 0 }, "PUT"), params({ id: "5", halaqahId: "3" }))).status).toBe(400);
    expect((await criteria.PUT(jsonRequest({ minAge: 12, maxAge: 8 }, "PUT"), params({ id: "5", halaqahId: "3" }))).status).toBe(400);
    expect(mocks.updateHalaqahCriteria).not.toHaveBeenCalled();

    const ok = await criteria.PUT(jsonRequest({ capacity: "20", level: "beginner" }, "PUT"), params({ id: "5", halaqahId: "3" }));
    expect(ok.status).toBe(200);
    expect(mocks.updateHalaqahCriteria).toHaveBeenCalledWith(5, 3, { capacity: 20, minAge: null, maxAge: null, level: "beginner" });

    mocks.updateHalaqahCriteria.mockResolvedValue(null); // حلقة جامع آخر
    expect((await criteria.PUT(jsonRequest({ capacity: 5 }, "PUT"), params({ id: "5", halaqahId: "99" }))).status).toBe(404);
  });

  it("حدّ الكتابة يسبق التنفيذ", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    const res = await waitlist.DELETE(new Request("http://x", { method: "DELETE" }), params({ id: "5", registrationId: "3" }));
    expect(res.status).toBe(429);
    expect(mocks.removeWaitlistEntry).not.toHaveBeenCalled();
  });
});
