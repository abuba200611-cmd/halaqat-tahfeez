import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  مسارات طلبات تسجيل الجوامع بلوحة المطوّر: لا وصول لغير المطوّر (devConsoleGate
  الحقيقي فوق محاكاة أدواته: مستضيج عام 404، بلا أدمن 401، «عرض كـ» 403)،
  والموافقة/الرفض يمرّان لطبقة البيانات فقط بعد البوابة والتحقق.
*/

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  isDevConsoleRequest: vi.fn(),
  currentImpersonation: vi.fn(),
  approveRegistrationRequest: vi.fn(),
  rejectRegistrationRequest: vi.fn(),
  listRegistrationRequests: vi.fn(),
  countPendingRegistrationRequests: vi.fn(),
  listAssociations: vi.fn(),
}));

vi.mock("@/lib/mosque/admin-auth", () => ({
  isAdmin: mocks.isAdmin,
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
}));
vi.mock("@/lib/host-gate", () => ({
  isDevConsoleRequest: mocks.isDevConsoleRequest,
  hostNotFound: () => new Response(null, { status: 404 }),
}));
vi.mock("@/lib/dev-impersonation", () => ({
  currentImpersonation: mocks.currentImpersonation,
  impersonationBlocked: () => Response.json({ error: "أثناء العرض كـ" }, { status: 403 }),
}));
vi.mock("@/lib/mosque-registration-db", () => ({
  approveRegistrationRequest: mocks.approveRegistrationRequest,
  rejectRegistrationRequest: mocks.rejectRegistrationRequest,
  listRegistrationRequests: mocks.listRegistrationRequests,
  countPendingRegistrationRequests: mocks.countPendingRegistrationRequests,
}));
vi.mock("@/lib/association-db", () => ({ listAssociations: mocks.listAssociations }));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn() }));

const { GET } = await import("./route");
const { POST: approve } = await import("./[id]/approve/route");
const { POST: reject } = await import("./[id]/reject/route");

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const json = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDevConsoleRequest.mockResolvedValue(true);
  mocks.isAdmin.mockResolvedValue(true);
  mocks.currentImpersonation.mockResolvedValue(null);
  mocks.approveRegistrationRequest.mockResolvedValue({ ok: true, mosqueId: 7, adminId: 8, associationId: null });
  mocks.rejectRegistrationRequest.mockResolvedValue({ ok: true });
});

describe("غير المطوّر لا يصل لمسارات الطلبات", () => {
  const denied: [string, () => void, number][] = [
    ["مستضيج عام", () => mocks.isDevConsoleRequest.mockResolvedValue(false), 404],
    ["بلا جلسة أدمن", () => mocks.isAdmin.mockResolvedValue(false), 401],
    ["أثناء عرض كـ", () => mocks.currentImpersonation.mockResolvedValue({ kind: "teacher" }), 403],
  ];
  for (const [title, arrange, status] of denied) {
    it(`${title} → ${status} للموافقة والرفض والقائمة، بلا لمس البيانات`, async () => {
      arrange();
      expect((await approve(json({}), params("1"))).status).toBe(status);
      expect((await reject(json({ reason: "سبب واضح" }), params("1"))).status).toBe(status);
      expect((await GET(new Request("http://localhost/api/dev/mosque-requests"))).status).toBe(status);
      expect(mocks.approveRegistrationRequest).not.toHaveBeenCalled();
      expect(mocks.rejectRegistrationRequest).not.toHaveBeenCalled();
      expect(mocks.listRegistrationRequests).not.toHaveBeenCalled();
    });
  }
});

describe("POST approve", () => {
  it("موافقة → 200 وتمرّر الجمعية المختارة", async () => {
    const res = await approve(json({ associationId: 3 }), params("5"));
    expect(res.status).toBe(200);
    expect(mocks.approveRegistrationRequest).toHaveBeenCalledWith(5, { associationId: 3 });
    expect((await res.json()).mosqueId).toBe(7);
  });

  it("بلا جمعية مختارة → المطابقة بالاسم تتولاها طبقة البيانات", async () => {
    await approve(json({}), params("5"));
    expect(mocks.approveRegistrationRequest).toHaveBeenCalledWith(5, { associationId: undefined });
  });

  it("الموافقة الثانية (مبتوت فيه) → 409 لا إنشاء ثانٍ", async () => {
    mocks.approveRegistrationRequest.mockResolvedValue({ ok: false, code: "already_decided" });
    const res = await approve(json({}), params("5"));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("already_decided");
  });

  it("غير موجود 404، اسم محجوز 409، معرّف سيئ 400", async () => {
    mocks.approveRegistrationRequest.mockResolvedValueOnce({ ok: false, code: "not_found" });
    expect((await approve(json({}), params("5"))).status).toBe(404);
    mocks.approveRegistrationRequest.mockResolvedValueOnce({ ok: false, code: "username_taken" });
    expect((await approve(json({}), params("5"))).status).toBe(409);
    expect((await approve(json({}), params("abc"))).status).toBe(400);
    expect((await approve(json({ associationId: "x" }), params("5"))).status).toBe(400);
  });
});

describe("POST reject", () => {
  it("رفض بسبب → 200", async () => {
    const res = await reject(json({ reason: "بيانات ناقصة" }), params("5"));
    expect(res.status).toBe(200);
    expect(mocks.rejectRegistrationRequest).toHaveBeenCalledWith(5, "بيانات ناقصة");
  });

  it("بلا سبب أو بسبب قصير → 400 بلا رفض", async () => {
    expect((await reject(json({}), params("5"))).status).toBe(400);
    expect((await reject(json({ reason: "ab" }), params("5"))).status).toBe(400);
    expect(mocks.rejectRegistrationRequest).not.toHaveBeenCalled();
  });

  it("مبتوت فيه → 409، وغير موجود → 404", async () => {
    mocks.rejectRegistrationRequest.mockResolvedValueOnce({ ok: false, code: "already_decided" });
    expect((await reject(json({ reason: "سبب واضح" }), params("5"))).status).toBe(409);
    mocks.rejectRegistrationRequest.mockResolvedValueOnce({ ok: false, code: "not_found" });
    expect((await reject(json({ reason: "سبب واضح" }), params("5"))).status).toBe(404);
  });
});

describe("GET", () => {
  it("?count=1 يرجع عدّاد المعلّق فقط (شارة القائمة)", async () => {
    mocks.countPendingRegistrationRequests.mockResolvedValue(3);
    const res = await GET(new Request("http://localhost/api/dev/mosque-requests?count=1"));
    expect(await res.json()).toEqual({ pending: 3 });
    expect(mocks.listRegistrationRequests).not.toHaveBeenCalled();
  });

  it("القائمة تتضمن الجمعيات والعدّاد", async () => {
    mocks.listRegistrationRequests.mockResolvedValue([
      { id: 1, status: "pending" },
      { id: 2, status: "approved" },
    ]);
    mocks.listAssociations.mockResolvedValue([{ id: 4, name: "الخير", city: "" }]);
    const body = await (await GET(new Request("http://localhost/api/dev/mosque-requests"))).json();
    expect(body.pending).toBe(1);
    expect(body.associations).toEqual([{ id: 4, name: "الخير" }]);
  });
});
