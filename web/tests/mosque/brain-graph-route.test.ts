import { beforeEach, describe, expect, it, vi } from "vitest";

/* مساري الرسم والسياق: 401 لغير المصرّح، 404 لميزة معطّلة، وإلا بيانات. */

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({ getMosque: vi.fn(), isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/mosque/brain-graph", () => ({
  buildMosqueGraph: vi.fn(),
  buildGraphContext: vi.fn(() => "الجامع: جامع النور"),
}));

import { GET as GRAPH } from "@/app/api/mosques/[id]/brain/graph/route";
import { GET as CONTEXT } from "@/app/api/mosques/[id]/brain/context/route";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque, isFeatureEnabled } from "@/lib/mosque/db";
import { buildMosqueGraph } from "@/lib/mosque/brain-graph";

const ctx = { params: Promise.resolve({ id: "1" }) };
const request = new Request("http://localhost");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(canAccessMosque).mockResolvedValue(true);
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  vi.mocked(getMosque).mockResolvedValue({ id: 1, name: "جامع النور", city: "", createdAt: "" });
  vi.mocked(buildMosqueGraph).mockResolvedValue({ nodes: [], edges: [] });
});

describe.each([
  ["graph", GRAPH],
  ["context", CONTEXT],
])("GET /api/mosques/[id]/brain/%s", (_name, handler) => {
  it("مدير جامع آخر أو زائر = 401 ولا يُبنى الرسم", async () => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await handler(request, ctx)).status).toBe(401);
    expect(buildMosqueGraph).not.toHaveBeenCalled();
  });

  it("ميزة الدماغ معطّلة = 404 حتى مع الصلاحية", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    expect((await handler(request, ctx)).status).toBe(404);
    expect(buildMosqueGraph).not.toHaveBeenCalled();
  });

  it("جامع غير موجود = 404", async () => {
    vi.mocked(getMosque).mockResolvedValue(null);
    expect((await handler(request, ctx)).status).toBe(404);
  });
});

describe("الاستجابات الناجحة", () => {
  it("graph يعيد JSON بالعُقَد والحوافّ", async () => {
    const res = await GRAPH(request, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ nodes: [], edges: [] });
    expect(buildMosqueGraph).toHaveBeenCalledWith(1);
  });

  it("context يعيد نصاً عربياً صرفاً", async () => {
    const res = await CONTEXT(request, ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("الجامع: جامع النور");
  });
});
