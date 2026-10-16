import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  مسار /api/mosques/[id]/features — الصلاحيات والتحقق من المدخلات.
  نحاكي canAccessMosque (مدير جامع آخر = false) وطبقة القاعدة، فنختبر
  منطق المسار نفسه: 401/400 والاستدعاءات الصحيحة.
*/

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(),
  getMosqueFeatures: vi.fn(),
  setMosqueFeature: vi.fn(),
}));

import { GET, PATCH } from "@/app/api/mosques/[id]/features/route";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque, getMosqueFeatures, setMosqueFeature, type MosqueFeature } from "@/lib/mosque/db";

const featuresList: MosqueFeature[] = [
  { key: "stats", nameAr: "الإحصائيات", descriptionAr: "", defaultEnabled: true, status: "ready", enabled: true },
  { key: "badges", nameAr: "الأوسمة", descriptionAr: "", defaultEnabled: false, status: "ready", enabled: false },
  { key: "agent", nameAr: "المساعد الذكي", descriptionAr: "", defaultEnabled: false, status: "ready", enabled: false },
];

function ctx(id = "1") {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/mosques/1/features", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(canAccessMosque).mockResolvedValue(true);
  vi.mocked(getMosque).mockResolvedValue({ id: 1, name: "جامع النور", city: "", createdAt: "" });
  vi.mocked(getMosqueFeatures).mockResolvedValue(featuresList);
  vi.mocked(setMosqueFeature).mockResolvedValue(undefined);
});

describe("GET /api/mosques/[id]/features", () => {
  it("بلا صلاحية (مدير جامع آخر أو زائر) = 401", async () => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(401);
  });

  it("جامع غير موجود = 404", async () => {
    vi.mocked(getMosque).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(404);
  });

  it("بصلاحية: يعيد قائمة المزايا مدموجة بالحالة", async () => {
    const res = await GET(new Request("http://localhost"), ctx());
    expect(res.status).toBe(200);
    const data = (await res.json()) as { features: typeof featuresList };
    expect(data.features).toEqual(featuresList);
  });
});

describe("PATCH /api/mosques/[id]/features", () => {
  it("بلا صلاحية = 401", async () => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    const res = await PATCH(patchRequest({ key: "stats", enabled: false }), ctx());
    expect(res.status).toBe(401);
    expect(setMosqueFeature).not.toHaveBeenCalled();
  });

  it("مفتاح غير معروف = 400 ولا يكتب", async () => {
    const res = await PATCH(patchRequest({ key: "not_a_feature", enabled: true }), ctx());
    expect(res.status).toBe(400);
    expect(setMosqueFeature).not.toHaveBeenCalled();
  });

  it("enabled ليس boolean = 400", async () => {
    const res = await PATCH(patchRequest({ key: "stats", enabled: "نعم" }), ctx());
    expect(res.status).toBe(400);
    expect(setMosqueFeature).not.toHaveBeenCalled();
  });

  it("تفعيل/تعطيل ميزة جاهزة: يكتب ويعيد القائمة المحدّثة", async () => {
    const res = await PATCH(patchRequest({ key: "stats", enabled: false }), ctx());
    expect(res.status).toBe(200);
    expect(setMosqueFeature).toHaveBeenCalledWith(1, "stats", false);
    const data = (await res.json()) as { features: typeof featuresList };
    expect(data.features).toEqual(featuresList);
  });

  it("تفعيل ميزة المساعد (جاهزة من M6): يكتب كأي ميزة", async () => {
    const res = await PATCH(patchRequest({ key: "agent", enabled: true }), ctx());
    expect(res.status).toBe(200);
    expect(setMosqueFeature).toHaveBeenCalledWith(1, "agent", true);
  });
});
