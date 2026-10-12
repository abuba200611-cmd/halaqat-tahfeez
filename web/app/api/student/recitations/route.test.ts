import { beforeEach, describe, expect, it, vi } from "vitest";
import { MP3_ID3, WEBM } from "@/lib/test/audio-fixtures";

const authMocks = vi.hoisted(() => ({
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({ insertRecitation: vi.fn(), listStudentRecitations: vi.fn() }));
vi.mock("@/lib/recitations-db", () => dbMocks);

const rateMocks = vi.hoisted(() => ({ checkRateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/rate-limit", () => rateMocks);

const { GET, POST } = await import("./route");

const student = { teacherId: 3, id: "s9", name: "x", halaqahName: "h" };

function form(over: { audio?: Blob | null; mime?: string; fields?: Record<string, string> } = {}) {
  const fd = new FormData();
  fd.set("surah", "67");
  fd.set("fromAyah", "1");
  fd.set("toAyah", "30");
  fd.set("durationSec", "60");
  for (const [k, v] of Object.entries(over.fields ?? {})) fd.set(k, v);
  const audio = over.audio === undefined ? new Blob([WEBM]) : over.audio;
  if (audio) fd.set("audio", new File([audio], "r.webm", { type: over.mime ?? "audio/webm" }));
  return new Request("http://localhost/api/student/recitations", { method: "POST", body: fd });
}

describe("POST /api/student/recitations (STEP 64)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentStudent.mockResolvedValue(student);
    rateMocks.checkRateLimit.mockResolvedValue(true);
    dbMocks.insertRecitation.mockResolvedValue(5);
  });

  it("بلا جلسة: 401 ولا كتابة", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    expect((await POST(form())).status).toBe(401);
    expect(dbMocks.insertRecitation).not.toHaveBeenCalled();
  });

  it("يحفظ بحلقة الطالب ومعرّفه من الجلسة فقط (حقول العميل تُتجاهَل)", async () => {
    const res = await POST(form({ fields: { halaqahId: "99", studentId: "other", teacherId: "99" } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 5 });
    const arg = dbMocks.insertRecitation.mock.calls[0][0];
    expect(arg.halaqahId).toBe(3);
    expect(arg.studentId).toBe("s9");
    expect(arg.mime).toBe("audio/webm");
    expect(arg.durationSec).toBe(60);
    expect(arg.range).toEqual({ surah: 67, fromAyah: 1, toAyah: 30 });
  });

  it("حد المعدّل 10/يوم لكل طالب: 429 ولا كتابة", async () => {
    rateMocks.checkRateLimit.mockResolvedValue(false);
    const res = await POST(form());
    expect(res.status).toBe(429);
    expect(rateMocks.checkRateLimit).toHaveBeenCalledWith("recitation:3:s9", 10, 86400);
    expect(dbMocks.insertRecitation).not.toHaveBeenCalled();
  });

  it("يفحص المعدّل بعد التحقق: طلب غير صالح لا يستهلك الحصة", async () => {
    await POST(form({ fields: { surah: "200" } }));
    expect(rateMocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("يرفض ملفاً نصياً مُعلَناً audio/webm (فحص البايتات)", async () => {
    const res = await POST(form({ audio: new Blob(["not audio"]) }));
    expect(res.status).toBe(400);
    expect(dbMocks.insertRecitation).not.toHaveBeenCalled();
  });

  it("يرفض عدم تطابق النوع المُعلَن مع البايتات", async () => {
    expect((await POST(form({ audio: new Blob([MP3_ID3]), mime: "audio/webm" }))).status).toBe(400);
  });

  it("يرفض ما فوق ٣MB (413)", async () => {
    const big = new Uint8Array(3 * 1024 * 1024 + 1);
    big.set(WEBM);
    const res = await POST(form({ audio: new Blob([big]) }));
    expect(res.status).toBe(413);
    expect(dbMocks.insertRecitation).not.toHaveBeenCalled();
  });

  it("يرفض مدة 0 وما فوق ٣ دقائق وغير الرقمية", async () => {
    for (const d of ["0", "181.5", "600", "abc", ""]) {
      expect((await POST(form({ fields: { durationSec: d } }))).status).toBe(400);
    }
    expect(dbMocks.insertRecitation).not.toHaveBeenCalled();
  });

  it("يرفض نطاق آيات غير صحيح أو بلا ملف", async () => {
    expect((await POST(form({ fields: { toAyah: "31" } }))).status).toBe(400); // الملك 30 آية
    expect((await POST(form({ fields: { surah: "0" } }))).status).toBe(400);
    expect((await POST(form({ audio: null }))).status).toBe(400);
  });

  it("طالب غير موجود/موقوف عند الإدراج: 404", async () => {
    dbMocks.insertRecitation.mockResolvedValue(null);
    expect((await POST(form())).status).toBe(404);
  });
});

describe("GET /api/student/recitations (STEP 64)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("بلا جلسة: 401", async () => {
    authMocks.currentStudent.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("يقرأ بهوية الجلسة فقط", async () => {
    authMocks.currentStudent.mockResolvedValue(student);
    dbMocks.listStudentRecitations.mockResolvedValue([]);
    await GET();
    expect(dbMocks.listStudentRecitations).toHaveBeenCalledWith(3, "s9");
  });
});
