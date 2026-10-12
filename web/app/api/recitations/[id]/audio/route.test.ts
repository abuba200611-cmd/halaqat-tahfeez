import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({ currentStudent: vi.fn(), currentTeacher: vi.fn() }));
vi.mock("@/lib/auth", () => authMocks);

const parentAuthMocks = vi.hoisted(() => ({ currentParent: vi.fn() }));
vi.mock("@/lib/parent-auth", () => parentAuthMocks);

const parentDbMocks = vi.hoisted(() => ({ getParentChild: vi.fn() }));
vi.mock("@/lib/parent-db", () => parentDbMocks);

const dbMocks = vi.hoisted(() => ({ getRecitationMeta: vi.fn(), getRecitationAudio: vi.fn() }));
vi.mock("@/lib/recitations-db", () => dbMocks);

const { GET } = await import("./route");

// تلاوة رقم 5 تخص الطالب s1 بالحلقة 3
const META = { id: 5, halaqahId: 3, studentId: "s1", mime: "audio/webm", sizeBytes: 10 };
const BYTES = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 1, 2, 3, 4, 5]);

const call = (headers: Record<string, string> = {}, id = "5") =>
  GET(new Request(`http://localhost/api/recitations/${id}/audio`, { headers }), {
    params: Promise.resolve({ id }),
  });

function who(opts: {
  student?: { teacherId: number; id: string } | null;
  teacher?: { halaqahId: number } | null;
  parentLinked?: boolean | null; // null = لا جلسة ولي
}) {
  authMocks.currentStudent.mockResolvedValue(opts.student ?? null);
  authMocks.currentTeacher.mockResolvedValue(opts.teacher ?? null);
  const hasParent = opts.parentLinked !== undefined && opts.parentLinked !== null;
  parentAuthMocks.currentParent.mockResolvedValue(hasParent ? { id: 40 } : null);
  parentDbMocks.getParentChild.mockResolvedValue(
    opts.parentLinked ? { halaqahId: 3, studentId: "s1" } : null,
  );
}

describe("GET /api/recitations/[id]/audio — مصفوفة الصلاحيات (STEP 64)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getRecitationMeta.mockResolvedValue(META);
    dbMocks.getRecitationAudio.mockResolvedValue(BYTES);
  });

  it("الطالب صاحب التلاوة: 200 بالنوع الصحيح وترويسات الخصوصية", async () => {
    who({ student: { teacherId: 3, id: "s1" } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/webm");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BYTES);
  });

  it("طالب آخر بنفس الحلقة: 404 ولا يُجلب الصوت", async () => {
    who({ student: { teacherId: 3, id: "s2" } });
    expect((await call()).status).toBe(404);
    expect(dbMocks.getRecitationAudio).not.toHaveBeenCalled();
  });

  it("طالب بنفس المعرّف لكن حلقة أخرى: 404", async () => {
    who({ student: { teacherId: 4, id: "s1" } });
    expect((await call()).status).toBe(404);
  });

  it("معلّم الحلقة (مشرف أو مساعد): 200", async () => {
    who({ teacher: { halaqahId: 3 } });
    expect((await call()).status).toBe(200);
  });

  it("معلّم حلقة أخرى: 404", async () => {
    who({ teacher: { halaqahId: 9 } });
    expect((await call()).status).toBe(404);
    expect(dbMocks.getRecitationAudio).not.toHaveBeenCalled();
  });

  it("ولي أمر مرتبط بالطالب: 200 (والربط يُفحص بحلقة الطالب ومعرّفه)", async () => {
    who({ parentLinked: true });
    expect((await call()).status).toBe(200);
    expect(parentDbMocks.getParentChild).toHaveBeenCalledWith(40, 3, "s1");
  });

  it("ولي أمر غير مرتبط: 404", async () => {
    who({ parentLinked: false });
    expect((await call()).status).toBe(404);
    expect(dbMocks.getRecitationAudio).not.toHaveBeenCalled();
  });

  it("زائر بلا أي جلسة: 404 (لا 401)", async () => {
    who({});
    expect((await call()).status).toBe(404);
  });

  it("تلاوة غير موجودة أو معرّف غير رقمي: 404 دون فحص الجلسات", async () => {
    who({ teacher: { halaqahId: 3 } });
    dbMocks.getRecitationMeta.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect((await call({}, "abc")).status).toBe(404);
    expect((await call({}, "0")).status).toBe(404);
  });
});

describe("GET audio — Range (STEP 64)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getRecitationMeta.mockResolvedValue(META);
    dbMocks.getRecitationAudio.mockResolvedValue(BYTES);
    who({ student: { teacherId: 3, id: "s1" } });
  });

  it("طلب نطاق: 206 مع Content-Range والبايتات المطلوبة فقط", async () => {
    const res = await call({ Range: "bytes=2-5" });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BYTES.subarray(2, 6));
  });

  it("نطاق خارج الحجم: 416", async () => {
    const res = await call({ Range: "bytes=50-" });
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */10");
  });
});
