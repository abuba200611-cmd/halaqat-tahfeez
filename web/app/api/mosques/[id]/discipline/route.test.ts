import { beforeEach, describe, expect, it, vi } from "vitest";

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

const dbMocks = vi.hoisted(() => ({
  getDisciplineConfig: vi.fn(),
  listMosqueEvents: vi.fn(async () => []),
  listActiveSuspensions: vi.fn(async () => []),
  restoreExpiredSuspensions: vi.fn(async () => ({ due: 0, restored: 0 })),
}));
vi.mock("@/lib/discipline-db", () => dbMocks);

vi.mock("@/lib/mosque/db", () => ({ getMosque: vi.fn(async () => ({ id: 5, name: "جامع النور", city: "", createdAt: "" })) }));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn(async () => undefined) }));

const { GET } = await import("./route");

type RouteContext = { params: Promise<{ id: string }> };
const ctx = (id: string): RouteContext => ({ params: Promise.resolve({ id }) });

describe("GET /api/mosques/[id]/discipline — بوابة الإدارة", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getDisciplineConfig.mockResolvedValue({ absence: {}, violations: {} });
  });

  it("معرّف جامع غير صالح: 404", async () => {
    expect((await GET(new Request("http://localhost/x"), ctx("abc"))).status).toBe(404);
  });

  it("الميزة معطّلة لهذا الجامع: 404 من featureGate ولا قراءة", async () => {
    gateMocks.featureGate.mockResolvedValueOnce(Response.json({ error: "معطّل" }, { status: 404 }));
    const res = await GET(new Request("http://localhost/x"), ctx("5"));
    expect(res.status).toBe(404);
    expect(dbMocks.listMosqueEvents).not.toHaveBeenCalled();
  });

  it("السعادة: استرجاع كسول + أحداث الجامع فقط", async () => {
    const res = await GET(new Request("http://localhost/x"), ctx("5"));
    expect(res.status).toBe(200);
    expect(gateMocks.featureGate).toHaveBeenCalledWith(5, "discipline");
    expect(dbMocks.restoreExpiredSuspensions).toHaveBeenCalledWith({ mosqueId: 5 });
    expect(dbMocks.listMosqueEvents).toHaveBeenCalledWith(5);
    expect(dbMocks.listActiveSuspensions).toHaveBeenCalledWith({ mosqueId: 5 });
  });
});
