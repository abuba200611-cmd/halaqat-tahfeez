import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookieStore.value === undefined ? undefined : { value: cookieStore.value }) }),
  // dev split: فحص المستضيج يقرأ ترويسات الطلب — بيئة الاختبار localhost
  headers: async () => ({ get: (name: string) => (name === "host" ? "localhost:3000" : null) }),
}));

const dbMocks = vi.hoisted(() => ({ getSuggestionAttachmentImage: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

vi.mock("../../../login/route", () => ({ ADMIN_COOKIE: "admin_session" }));

const { GET } = await import("./route");
const { createAdminToken } = await import("@/lib/admin-session");

const ORIGINAL_SECRET = process.env.ADMIN_SECRET;

function req(): Request {
  return new Request("http://localhost/api/admin/suggestions/attachments/1");
}

describe("GET /api/admin/suggestions/attachments/[id] — للأدمن فقط (STEP 55ب)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStore.value = undefined;
    process.env.ADMIN_SECRET = "s3cr3t";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = ORIGINAL_SECRET;
    vi.useRealTimers();
  });

  it("بلا جلسة أدمن: 404 لا 401 (لا يكشف عن وجود المسار)، ولا يُقرأ من القاعدة", async () => {
    const res = await GET(req(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
    expect(dbMocks.getSuggestionAttachmentImage).not.toHaveBeenCalled();
  });

  it("بجلسة أدمن خطأ: 404 أيضاً", async () => {
    cookieStore.value = "wrong-secret";
    const res = await GET(req(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
  });

  it("الكوكي يحمل السرّ الخام نفسه (نمط قديم): مرفوض — السرّ لا يصح كتوكن جلسة", async () => {
    cookieStore.value = "s3cr3t";
    const res = await GET(req(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
    expect(dbMocks.getSuggestionAttachmentImage).not.toHaveBeenCalled();
  });

  it("توكن معدَّل (تلاعب بحرف واحد بالتوقيع): 404", async () => {
    const token = createAdminToken();
    const last = token.endsWith("0") ? "1" : "0";
    cookieStore.value = token.slice(0, -1) + last;
    const res = await GET(req(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
    expect(dbMocks.getSuggestionAttachmentImage).not.toHaveBeenCalled();
  });

  it("توكن منتهي (أكثر من ١٢ ساعة): 404", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-10T00:00:00Z"));
    const token = createAdminToken();
    vi.setSystemTime(new Date("2026-10-10T13:00:00Z"));
    cookieStore.value = token;
    const res = await GET(req(), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(404);
    expect(dbMocks.getSuggestionAttachmentImage).not.toHaveBeenCalled();
  });

  it("بجلسة أدمن صحيحة (توكن صالح) وصورة غير موجودة: 404", async () => {
    cookieStore.value = createAdminToken();
    dbMocks.getSuggestionAttachmentImage.mockResolvedValue(null);
    const res = await GET(req(), { params: Promise.resolve({ id: "999" }) });
    expect(res.status).toBe(404);
  });

  it("بجلسة أدمن صحيحة (توكن صالح) وصورة موجودة: 200 بالهيدرات المطلوبة بالضبط", async () => {
    cookieStore.value = createAdminToken();
    dbMocks.getSuggestionAttachmentImage.mockResolvedValue({ mime: "image/webp", bytes: Buffer.from([1, 2, 3]) });

    const res = await GET(req(), { params: Promise.resolve({ id: "1" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/webp");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Disposition")).toBe("inline");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("Content-Security-Policy")).toBe("default-src 'none'");
  });
});
