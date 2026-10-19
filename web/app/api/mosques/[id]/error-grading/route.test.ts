import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ERROR_GRADING_CONFIG } from "@/lib/error-grading";

const gateMocks = vi.hoisted(() => ({
  featureGate: vi.fn(async (_mosqueId: number, _featureKey: string): Promise<Response | null> => null),
  parsePositiveIntParam: (value: string | undefined) => {
    if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
    const num = Number(value);
    return Number.isSafeInteger(num) && num > 0 ? num : null;
  },
  paramNotFound: () => Response.json({ error: "غير موجود" }, { status: 404 }),
}));
vi.mock("@/lib/mosque/api-gate", () => gateMocks);

const dbMocks = vi.hoisted(() => ({ getErrorGradingConfig: vi.fn(), setErrorGradingConfig: vi.fn() }));
vi.mock("@/lib/error-grading-db", () => dbMocks);
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const { GET, PUT } = await import("./route");

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });
const put = (id: string, body: unknown) =>
  PUT(new Request("http://localhost/x", { method: "PUT", body: JSON.stringify(body) }), ctx(id));

describe("/api/mosques/[id]/error-grading — إعدادات الجامع", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gateMocks.featureGate.mockResolvedValue(null);
    dbMocks.getErrorGradingConfig.mockResolvedValue(DEFAULT_ERROR_GRADING_CONFIG);
  });

  it("معرّف جامع غير صالح: 404 قبل أي فحص", async () => {
    expect((await GET(new Request("http://localhost/x"), ctx("abc"))).status).toBe(404);
    expect(gateMocks.featureGate).not.toHaveBeenCalled();
  });

  it("البوابة ترفض (جامع غيرك/ميزة معطّلة): تُمرَّر النتيجة بلا قراءة ولا كتابة", async () => {
    gateMocks.featureGate.mockResolvedValue(Response.json({ error: "x" }, { status: 401 }));
    expect((await GET(new Request("http://localhost/x"), ctx("5"))).status).toBe(401);
    expect((await put("5", DEFAULT_ERROR_GRADING_CONFIG)).status).toBe(401);
    expect(dbMocks.getErrorGradingConfig).not.toHaveBeenCalled();
    expect(dbMocks.setErrorGradingConfig).not.toHaveBeenCalled();
  });

  it("GET يقرأ إعدادات الجامع من المسار بعد بوابة الميزة", async () => {
    const res = await GET(new Request("http://localhost/x"), ctx("5"));
    expect(gateMocks.featureGate).toHaveBeenCalledWith(5, "error_grading");
    expect(dbMocks.getErrorGradingConfig).toHaveBeenCalledWith(5);
    expect((await res.json()).config).toEqual(DEFAULT_ERROR_GRADING_CONFIG);
  });

  it("PUT: إعداد غير صالح 400 ولا كتابة", async () => {
    const res = await put("5", { ...DEFAULT_ERROR_GRADING_CONFIG, baseScore: 0 });
    expect(res.status).toBe(400);
    expect(dbMocks.setErrorGradingConfig).not.toHaveBeenCalled();
  });

  it("PUT: جسم تالف 400", async () => {
    const res = await PUT(new Request("http://localhost/x", { method: "PUT", body: "not json" }), ctx("5"));
    expect(res.status).toBe(400);
  });

  it("PUT: يكتب للجامع الذي في المسار فقط", async () => {
    const res = await put("5", DEFAULT_ERROR_GRADING_CONFIG);
    expect(res.status).toBe(200);
    expect(dbMocks.setErrorGradingConfig).toHaveBeenCalledWith(5, DEFAULT_ERROR_GRADING_CONFIG);
  });
});
