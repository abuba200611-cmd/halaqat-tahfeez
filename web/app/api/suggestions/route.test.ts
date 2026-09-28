import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "غير مصرّح" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ addSuggestion: vi.fn() }));
vi.mock("@/lib/db", () => dbMocks);

const imageMocks = vi.hoisted(() => ({ readAndProcessAttachments: vi.fn() }));
vi.mock("@/lib/image-processing", () => imageMocks);

const { POST } = await import("./route");

const FAKE_TEACHER = {
  id: 2,
  username: "u",
  teacherName: "معلّم",
  halaqahId: 1,
  halaqahName: "حلقة",
  role: "supervisor" as const,
  emailVerified: true,
};

function postReq(fields: Record<string, string | Blob | Blob[]>): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => body.append(key, v));
    else body.set(key, value);
  }
  return new Request("http://localhost/api/suggestions", { method: "POST", body });
}

describe("POST /api/suggestions (المعلّم، STEP 55ب)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(FAKE_TEACHER);
  });

  it("صور مع نوع 'اقتراح' مرفوضة (400)", async () => {
    const fakeFile = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const res = await POST(postReq({ message: "اقتراح جميل", type: "suggestion", images: [fakeFile] }));
    expect(res.status).toBe(400);
    expect(imageMocks.readAndProcessAttachments).not.toHaveBeenCalled();
    expect(dbMocks.addSuggestion).not.toHaveBeenCalled();
  });

  it("بلاغ مشكلة بصورة صحيحة يمرّرها بعد معالجتها", async () => {
    const processed = { mime: "image/webp", bytes: Buffer.from("x"), sizeBytes: 1, width: 1, height: 1 };
    imageMocks.readAndProcessAttachments.mockResolvedValue([processed]);
    const fakeFile = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });

    const res = await POST(postReq({ message: "عندي مشكلة", type: "problem", images: [fakeFile] }));

    expect(res.status).toBe(200);
    expect(dbMocks.addSuggestion).toHaveBeenCalledWith(2, "حلقة (u)", "عندي مشكلة", "problem", [processed]);
  });
});
