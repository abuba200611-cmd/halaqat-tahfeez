import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  التوزيع والقائمة والتسجيل العام بعد الدمج: كلها استدعاءات مباشرة داخل
  العملية (لا fetch إلى أي خادم)، والتوزيع ذرّي (حجز ثم إنشاء الطالب ثم
  ربط student_id) مع تراجع عند الفشل.
*/

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/halaqat", () => ({
  addStudentToHalaqah: vi.fn(),
  getHalaqahRoster: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  rateLimited: () => Response.json({ error: "محاولات كثيرة" }, { status: 429 }),
}));
vi.mock("@/lib/mosque/db", () => ({
  getHalaqah: vi.fn(),
  getMosque: vi.fn(),
  getMosqueRegistration: vi.fn(),
  isFeatureEnabled: vi.fn(),
  claimRegistration: vi.fn(),
  setRegistrationStudent: vi.fn(),
  releaseRegistration: vi.fn(),
  addMosqueRegistration: vi.fn(),
}));

import { POST as assign } from "@/app/api/assign/route";
import { POST as register } from "@/app/api/register/route";
import { GET as roster } from "@/app/api/halaqahs/[id]/roster/route";
import { canAccessMosque } from "@/lib/mosque/access";
import * as db from "@/lib/mosque/db";
import { addStudentToHalaqah, getHalaqahRoster } from "@/lib/mosque/halaqat";
import { checkRateLimit } from "@/lib/rate-limit";

const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

const registration = {
  id: 9,
  mosqueId: 1,
  name: "خالد",
  phone: "",
  status: "pending" as const,
  halaqahId: null,
  studentId: null,
  createdAt: "",
  assignedAt: null,
};
const halaqah = (mosqueId: number | null) => ({ id: 20, mosqueId, halaqahName: "الفجر", teacherName: "أحمد", createdAt: "" });

const post = (body: unknown) =>
  new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  fetchSpy.mockReset();
  vi.mocked(canAccessMosque).mockResolvedValue(true);
  vi.mocked(db.getMosqueRegistration).mockResolvedValue(registration);
  vi.mocked(db.isFeatureEnabled).mockResolvedValue(true);
  vi.mocked(db.getHalaqah).mockResolvedValue(halaqah(1));
  vi.mocked(db.getMosque).mockResolvedValue({ id: 1, name: "جامع", city: "", createdAt: "" });
  vi.mocked(db.claimRegistration).mockResolvedValue(true);
  vi.mocked(addStudentToHalaqah).mockResolvedValue("student-abc");
  vi.mocked(checkRateLimit).mockResolvedValue(true);
});

describe("POST /api/assign", () => {
  it("ينشئ الطالب بالحلقة مباشرة ويربط student_id بلا أي fetch", async () => {
    const res = await assign(post({ registrationId: 9, halaqahId: 20 }));
    expect(res.status).toBe(200);
    expect(db.claimRegistration).toHaveBeenCalledWith(9, 20);
    expect(addStudentToHalaqah).toHaveBeenCalledWith(20, "خالد");
    expect(db.setRegistrationStudent).toHaveBeenCalledWith(9, "student-abc");
    expect(db.releaseRegistration).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("يقبل الاسم القديم pendingId للتوافق", async () => {
    expect((await assign(post({ pendingId: 9, halaqahId: 20 }))).status).toBe(200);
    expect(db.claimRegistration).toHaveBeenCalledWith(9, 20);
  });

  it("حلقة جامع آخر أو حلقة بلا جامع = 404 بلا أي كتابة", async () => {
    vi.mocked(db.getHalaqah).mockResolvedValue(halaqah(2));
    expect((await assign(post({ registrationId: 9, halaqahId: 20 }))).status).toBe(404);
    vi.mocked(db.getHalaqah).mockResolvedValue(halaqah(null));
    expect((await assign(post({ registrationId: 9, halaqahId: 20 }))).status).toBe(404);
    expect(db.claimRegistration).not.toHaveBeenCalled();
    expect(addStudentToHalaqah).not.toHaveBeenCalled();
  });

  it("موزَّع أصلاً = 409، وخسارة سباق الحجز = 409 بلا إنشاء طالب", async () => {
    vi.mocked(db.getMosqueRegistration).mockResolvedValue({ ...registration, status: "assigned" });
    expect((await assign(post({ registrationId: 9, halaqahId: 20 }))).status).toBe(409);
    vi.mocked(db.getMosqueRegistration).mockResolvedValue(registration);
    vi.mocked(db.claimRegistration).mockResolvedValue(false);
    expect((await assign(post({ registrationId: 9, halaqahId: 20 }))).status).toBe(409);
    expect(addStudentToHalaqah).not.toHaveBeenCalled();
  });

  it("فشل إنشاء الطالب يُرجع الحجز (يعود بانتظار التوزيع)", async () => {
    vi.mocked(addStudentToHalaqah).mockRejectedValue(new Error("db down"));
    const res = await assign(post({ registrationId: 9, halaqahId: 20 }));
    expect(res.status).toBe(500);
    expect(db.releaseRegistration).toHaveBeenCalledWith(9);
    expect(db.setRegistrationStudent).not.toHaveBeenCalled();
  });

  it("ميزة الحلقات معطّلة = 404، وتسجيل مجهول = 404، وبلا صلاحية = 401", async () => {
    vi.mocked(db.isFeatureEnabled).mockResolvedValue(false);
    expect((await assign(post({ registrationId: 9, halaqahId: 20 }))).status).toBe(404);
    vi.mocked(db.getMosqueRegistration).mockResolvedValue(null);
    expect((await assign(post({ registrationId: 99, halaqahId: 20 }))).status).toBe(404);
    vi.mocked(db.getMosqueRegistration).mockResolvedValue(registration);
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await assign(post({ registrationId: 9, halaqahId: 20 }))).status).toBe(401);
    expect(db.claimRegistration).not.toHaveBeenCalled();
  });
});

describe("GET /api/halaqahs/[id]/roster", () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;

  it("قائمة الحلقة من قاعدة الحلقات مباشرة", async () => {
    vi.mocked(getHalaqahRoster).mockResolvedValue({ teacherName: "أحمد", halaqahName: "الفجر", students: [] });
    const res = await roster(new Request("http://x"), ctx("20"));
    expect(res.status).toBe(200);
    expect(getHalaqahRoster).toHaveBeenCalledWith(halaqah(1));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("حلقة بلا جامع أو مجهولة = 404 (لا تُكشف حلقات المعلّمين غير المنضمّة)", async () => {
    vi.mocked(db.getHalaqah).mockResolvedValue(halaqah(null));
    expect((await roster(new Request("http://x"), ctx("20"))).status).toBe(404);
    vi.mocked(db.getHalaqah).mockResolvedValue(null);
    expect((await roster(new Request("http://x"), ctx("21"))).status).toBe(404);
    expect(getHalaqahRoster).not.toHaveBeenCalled();
  });

  it("بلا صلاحية على جامع الحلقة = 401", async () => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await roster(new Request("http://x"), ctx("20"))).status).toBe(401);
    expect(getHalaqahRoster).not.toHaveBeenCalled();
  });
});

describe("POST /api/register (تسجيل عام)", () => {
  it("يكتب في mosque_registrations عبر addMosqueRegistration بالاسم مقصوصاً", async () => {
    const res = await register(post({ mosqueId: 1, name: "  سعد  ", phone: " 0555 " }));
    expect(res.status).toBe(200);
    expect(db.addMosqueRegistration).toHaveBeenCalledWith(1, "سعد", "0555");
  });

  it("الميزة معطّلة = 404، والاسم فارغ = 400، وتجاوز المعدّل = 429", async () => {
    vi.mocked(db.isFeatureEnabled).mockResolvedValue(false);
    expect((await register(post({ mosqueId: 1, name: "سعد" }))).status).toBe(404);
    vi.mocked(db.isFeatureEnabled).mockResolvedValue(true);
    expect((await register(post({ mosqueId: 1, name: "  " }))).status).toBe(400);
    vi.mocked(checkRateLimit).mockResolvedValue(false);
    expect((await register(post({ mosqueId: 1, name: "سعد" }))).status).toBe(429);
    expect(db.addMosqueRegistration).not.toHaveBeenCalled();
  });
});
