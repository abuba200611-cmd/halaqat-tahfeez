import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "يجب على الطالب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  addStudentSuggestion: vi.fn(),
  checkStudentSuggestionRateLimit: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const imageMocks = vi.hoisted(() => ({ readAndProcessAttachments: vi.fn() }));
vi.mock("@/lib/image-processing", () => imageMocks);

const { POST } = await import("./route");

function postReq(fields: Record<string, string | Blob | Blob[]>): Request {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => body.append(key, v));
    else body.set(key, value);
  }
  return new Request("http://localhost/api/student/suggestions", { method: "POST", body });
}

const FAKE_STUDENT = { teacherId: 7, id: "real-student", name: "أحمد", halaqahName: "" };

describe("POST /api/student/suggestions (STEP 55)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.checkStudentSuggestionRateLimit.mockResolvedValue(true);
  });

  it("يرفض بدون تسجيل دخول (401)", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    const res = await POST(postReq({ message: "سلام", type: "suggestion" }));
    expect(res.status).toBe(401);
    expect(dbMocks.addStudentSuggestion).not.toHaveBeenCalled();
  });

  it("studentId وteacherId من جسم الطلب لا يُقبلان — الحفظ يستخدم قيم الجلسة حصراً", async () => {
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    const res = await POST(
      postReq({ message: "اقتراحي", type: "suggestion", studentId: "victim", teacherId: "999" }),
    );
    expect(res.status).toBe(200);
    expect(dbMocks.addStudentSuggestion).toHaveBeenCalledWith(7, "real-student", "suggestion", "اقتراحي", []);
  });

  it("النص الحرفي <script>alert(1)</script> يُخزَّن كما هو بلا أي تنظيف أو تهريب — الحماية تقع على العرض (React) لا التخزين", async () => {
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    const malicious = "<script>alert(1)</script>";
    const res = await POST(postReq({ message: malicious, type: "suggestion" }));
    expect(res.status).toBe(200);
    expect(dbMocks.addStudentSuggestion).toHaveBeenCalledWith(7, "real-student", "suggestion", malicious, []);
  });

  it("صور مع نوع 'اقتراح' مرفوضة (400)، ولا يُستدعى المعالج أو الحفظ", async () => {
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    const fakeFile = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const res = await POST(postReq({ message: "اقتراح", type: "suggestion", images: [fakeFile] }));
    expect(res.status).toBe(400);
    expect(imageMocks.readAndProcessAttachments).not.toHaveBeenCalled();
    expect(dbMocks.addStudentSuggestion).not.toHaveBeenCalled();
  });

  it("يفحص حد الإرسال بالساعة قبل الحفظ، ويرجع 429 لو تجاوزه الطالب", async () => {
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    dbMocks.checkStudentSuggestionRateLimit.mockResolvedValue(false);
    const res = await POST(postReq({ message: "بلاغ", type: "problem" }));
    expect(res.status).toBe(429);
    expect(dbMocks.addStudentSuggestion).not.toHaveBeenCalled();
  });

  it("بلاغ مشكلة بصورة صحيحة: يمرّرها لـaddStudentSuggestion بعد معالجتها", async () => {
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    const processed = { mime: "image/webp", bytes: Buffer.from("x"), sizeBytes: 1, width: 1, height: 1 };
    imageMocks.readAndProcessAttachments.mockResolvedValue([processed]);
    const fakeFile = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });

    const res = await POST(postReq({ message: "عندي مشكلة", type: "problem", images: [fakeFile] }));

    expect(res.status).toBe(200);
    expect(dbMocks.addStudentSuggestion).toHaveBeenCalledWith(7, "real-student", "bug", "عندي مشكلة", [processed]);
  });
});
