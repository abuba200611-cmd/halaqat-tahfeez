import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  STEP 54 (تعديل المستخدم قبل التطبيق): الإشعار الفوري عند اعتماد/رفض
  الورد يُجدوَل عبر after() (next/server) لا بـpromise معلّق بلا await —
  نتحقق هنا من شيئين: (أ) نتيجة PATCH لا تتأثر إطلاقاً حتى لو فشل
  إرسال الإشعار أو تأخّر، و(ب) after() فعلاً استُدعيت (لا استدعاء مباشر
  قبل إرجاع الرد). next/server's after() يرمي خارج سياق طلب حقيقي
  (Next runtime)، فنحاكيها هنا بدالة تلتقط الاستدعاء الأخير فقط.
*/
const afterMocks = vi.hoisted(() => ({
  after: vi.fn((cb: () => unknown) => {
    afterMocks.lastCallback = cb;
  }),
  lastCallback: undefined as (() => unknown) | undefined,
}));
vi.mock("next/server", () => ({ after: afterMocks.after }));

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "غير مصرّح" }, { status: 401 })),
  currentStudent: vi.fn(),
  studentUnauthorized: vi.fn(() => Response.json({ error: "يجب على الطالب تسجيل الدخول أولاً" }, { status: 401 })),
}));
vi.mock("@/lib/auth", () => authMocks);

const dbMocks = vi.hoisted(() => ({
  setWardLogStatus: vi.fn(),
  countNewWards: vi.fn(),
  createWardLog: vi.fn(),
  deleteWardLog: vi.fn(),
  listWardLogs: vi.fn(),
  updateWardLog: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const pushMocks = vi.hoisted(() => ({ sendPushToHalaqah: vi.fn(), sendPushToStudent: vi.fn() }));
vi.mock("@/lib/push", () => pushMocks);

const { PATCH } = await import("./route");

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/wards", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FAKE_TEACHER = {
  id: 2,
  username: "u",
  teacherName: "معلّم",
  halaqahId: 1,
  halaqahName: "حلقة",
  role: "supervisor" as const,
  emailVerified: true,
};

describe("PATCH /api/wards — الإشعار الفوري عبر after() لا يؤثر على النتيجة (STEP 54)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(FAKE_TEACHER);
    dbMocks.countNewWards.mockResolvedValue(0);
  });

  it("الاعتماد ينجح (200) حتى لو رمى إرسال الإشعار خطأ عند تنفيذه لاحقاً", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });
    pushMocks.sendPushToStudent.mockRejectedValue(new Error("push service down"));

    const res = await PATCH(patchReq({ id: 17, status: "approved" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, newCount: 0 });
    // الإشعار يُجدوَل بعد إرجاع الرد فعلاً، لا يُنتظَر قبله
    expect(afterMocks.after).toHaveBeenCalledTimes(1);
    // وتنفيذ ما جُدوِل لاحقاً (كما يفعل Next فعلياً) لا يرمي هو الآخر رغم فشل الإرسال
    await expect(afterMocks.lastCallback?.()).resolves.toBeUndefined();
  });

  it("طلب الإعادة ينجح أيضاً حتى لو تأخّر الإشعار أكثر من السقف (٣ ثوانٍ)", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });
    pushMocks.sendPushToStudent.mockImplementation(() => new Promise(() => {})); // لا يُحسم أبداً

    const res = await PATCH(patchReq({ id: 17, status: "needs_revision", note: "أعد المراجعة" }));

    expect(res.status).toBe(200);
    expect(afterMocks.after).toHaveBeenCalledTimes(1);
  });

  it("لا يُجدوَل أي إشعار عند 'اطّلع' (seen) — ليس قراراً بعد", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });

    const res = await PATCH(patchReq({ id: 17, status: "seen" }));

    expect(res.status).toBe(200);
    expect(afterMocks.after).not.toHaveBeenCalled();
    expect(pushMocks.sendPushToStudent).not.toHaveBeenCalled();
  });

  it("ورد غير موجود (404) لا يُجدوَل له أي إشعار", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue(null);

    const res = await PATCH(patchReq({ id: 999, status: "approved" }));

    expect(res.status).toBe(404);
    expect(afterMocks.after).not.toHaveBeenCalled();
  });
});
