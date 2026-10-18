import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  إعدادات واتساب لولي الأمر (B1): الجلسة شرط، الرقم يُطبَّع ويُرفض غير
  السعودي، والموافقة لا تُقبل بلا رقم (يُنفَّذها parent-db فنعايَرها).
*/

const parentAuthMocks = vi.hoisted(() => ({
  currentParent: vi.fn(),
  parentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/parent-auth", () => parentAuthMocks);

const parentDbMocks = vi.hoisted(() => ({
  getParentWhatsappInfo: vi.fn(),
  setParentWhatsappPhone: vi.fn(),
  setParentWhatsappOptIn: vi.fn(),
}));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const rateLimitMocks = vi.hoisted(() => ({ checkRateLimit: vi.fn(async () => true), rateLimited: vi.fn() }));
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

const { GET, PUT } = await import("./route");

const parent = { id: 42, email: "w@example.com", name: "ولي", sessionVersion: 0 };
const info = { phone: "966501234567", optedIn: false, optedInAt: null };

const put = (body: unknown) =>
  PUT(
    new Request("http://localhost/api/parent/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  parentAuthMocks.currentParent.mockResolvedValue(parent);
  parentDbMocks.getParentWhatsappInfo.mockResolvedValue(info);
  parentDbMocks.setParentWhatsappPhone.mockResolvedValue(undefined);
  parentDbMocks.setParentWhatsappOptIn.mockResolvedValue(true);
});

describe("GET /api/parent/whatsapp", () => {
  it("بلا جلسة ولي: 401", async () => {
    parentAuthMocks.currentParent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("بجلسة: يعيد الحالة الحالية", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(info);
  });
});

describe("PUT — الرقم", () => {
  it("رقم غير سعودي: 400 ولا حفظ", async () => {
    const res = await put({ phone: "0111234567" });
    expect(res.status).toBe(400);
    expect(parentDbMocks.setParentWhatsappPhone).not.toHaveBeenCalled();
  });

  it("رقم بصيغة 05…: يُحفظ مطبَّعاً E.164", async () => {
    const res = await put({ phone: "0501234567" });
    expect(res.status).toBe(200);
    expect(parentDbMocks.setParentWhatsappPhone).toHaveBeenCalledWith(parent.id, "966501234567");
  });

  it("body بلا هاتف ولا optIn: 200 دون كتابة", async () => {
    const res = await put({});
    expect(res.status).toBe(200);
    expect(parentDbMocks.setParentWhatsappPhone).not.toHaveBeenCalled();
    expect(parentDbMocks.setParentWhatsappOptIn).not.toHaveBeenCalled();
  });
});

describe("PUT — الموافقة الصريحة", () => {
  it("موافقة قبل أي رقم (رفض parent-db): 400", async () => {
    parentDbMocks.setParentWhatsappOptIn.mockResolvedValue(false);
    const res = await put({ optIn: true });
    expect(res.status).toBe(400);
  });

  it("موافقة بعد رقم محفوظ: تُقبل وتُرجع الحالة الجديدة", async () => {
    const optedIn = { ...info, optedIn: true };
    parentDbMocks.getParentWhatsappInfo.mockResolvedValue(optedIn);
    const res = await put({ optIn: true });
    expect(res.status).toBe(200);
    expect(parentDbMocks.setParentWhatsappOptIn).toHaveBeenCalledWith(parent.id, true);
    expect(await res.json()).toEqual(optedIn);
  });

  it("إيقاف الموافقة: يُمرَّر false", async () => {
    await put({ optIn: false });
    expect(parentDbMocks.setParentWhatsappOptIn).toHaveBeenCalledWith(parent.id, false);
  });
});
