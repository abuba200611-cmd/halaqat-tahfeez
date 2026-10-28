import { beforeEach, describe, expect, it, vi } from "vitest";
import { ayahRangeOfPageRange } from "@/lib/quran-surahs";
import { initialStatusFor } from "@/lib/ward-policy";

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
  reopenApprovedWard: vi.fn(),
  countNewWards: vi.fn(),
  createWardLog: vi.fn(),
  deleteWardLog: vi.fn(),
  listWardLogs: vi.fn(),
  updateWardLog: vi.fn(),
  listSameDayWardStubs: vi.fn(),
}));
vi.mock("@/lib/db", () => dbMocks);

const stageDbMocks = vi.hoisted(() => ({ getHalaqahStage: vi.fn(async (): Promise<string | null> => null) }));
vi.mock("@/lib/halaqah-stage-db", () => stageDbMocks);

const rateLimitMocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: vi.fn(() => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 })),
}));
vi.mock("@/lib/rate-limit", () => rateLimitMocks);

const pushMocks = vi.hoisted(() => ({
  sendPushToHalaqah: vi.fn(),
  sendPushToStudent: vi.fn(),
  sendPushToParentsOfStudent: vi.fn(),
}));
vi.mock("@/lib/push", () => pushMocks);

const whMocks = vi.hoisted(() => ({ emitHalaqahEvent: vi.fn(async () => undefined), emitMosqueEvent: vi.fn(async () => undefined) }));
vi.mock("@/lib/webhooks-db", () => whMocks);
const { POST, PUT, PATCH } = await import("./route");

function patchReq(body: unknown): Request {
  return new Request("http://localhost/api/wards", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postReq(body: unknown): Request {
  return new Request("http://localhost/api/wards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function putReq(body: unknown): Request {
  return new Request("http://localhost/api/wards", {
    method: "PUT",
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

  it("الاعتماد يُصدر progress.approved بلا ملاحظات، وطلب الإعادة لا يُصدره", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({
      studentId: "s1",
      log: { date: "2026-10-20", hifzAyah: { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5 }, reviewAyah: null },
    });
    await PATCH(patchReq({ id: 17, status: "approved" }));
    expect(whMocks.emitHalaqahEvent).toHaveBeenCalledWith(
      FAKE_TEACHER.halaqahId,
      "progress.approved",
      expect.objectContaining({ id: 17, student_id: "s1", status: "approved", hifz: { from_surah: 2, from_ayah: 1, to_surah: 2, to_ayah: 5 } }),
    );
    whMocks.emitHalaqahEvent.mockClear();
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });
    await PATCH(patchReq({ id: 17, status: "needs_revision", note: "x" }));
    expect(whMocks.emitHalaqahEvent).not.toHaveBeenCalled();
  });

  it("طلب الإعادة ينجح أيضاً حتى لو تأخّر الإشعار أكثر من السقف (٣ ثوانٍ)", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });
    pushMocks.sendPushToStudent.mockImplementation(() => new Promise(() => {})); // لا يُحسم أبداً

    const res = await PATCH(patchReq({ id: 17, status: "needs_revision", note: "أعد المراجعة" }));

    expect(res.status).toBe(200);
    expect(afterMocks.after).toHaveBeenCalledTimes(1);
  });

  it("STEP 61: الاعتماد يُشعر أولياء الأمور بعد الرد، وفشلهم لا يغيّر النتيجة ولا يمنع إشعار الطالب", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });
    pushMocks.sendPushToParentsOfStudent.mockRejectedValue(new Error("parent push down"));

    const res = await PATCH(patchReq({ id: 17, status: "approved" }));

    expect(res.status).toBe(200);
    expect(pushMocks.sendPushToParentsOfStudent).not.toHaveBeenCalled(); // لا يُستدعى قبل after()
    await expect(afterMocks.lastCallback?.()).resolves.toBeUndefined();
    expect(pushMocks.sendPushToStudent).toHaveBeenCalledTimes(1);
    expect(pushMocks.sendPushToParentsOfStudent).toHaveBeenCalledWith(1, "s1", "approved");
  });

  it("STEP 61: طلب الإعادة يُشعر الأولياء بقرار needs_revision", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });
    await PATCH(patchReq({ id: 17, status: "needs_revision", note: "أعد" }));
    await afterMocks.lastCallback?.();
    expect(pushMocks.sendPushToParentsOfStudent).toHaveBeenCalledWith(1, "s1", "needs_revision");
  });

  it("STEP 61: 'اطّلع' (seen) لا يُشعر الأولياء", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });
    await PATCH(patchReq({ id: 17, status: "seen" }));
    expect(pushMocks.sendPushToParentsOfStudent).not.toHaveBeenCalled();
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

/*
  001 T037 — طلب إعادة على ورد معتمد (FR-009، قرار المالك Q1 ب): كل ورد
  معتمد يُعاد فتحه أيّاً كان مسجِّله، عبر reopenApprovedWard بعدما يرفضه
  setWardLogStatus كما هو منذ STEP 52 — بملاحظة إلزامية وإخطار الطالب
  وولي الأمر كأي قرار إعادة.
*/
describe("PATCH /api/wards — إعادة فتح المعتمد (001 T037)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentTeacher.mockResolvedValue(FAKE_TEACHER);
    dbMocks.countNewWards.mockResolvedValue(0);
  });

  it("ورد معتمد: reopenApprovedWard يُستدعى بعد رفض setWardLogStatus، ويُخطر الطالب والأولياء بالملاحظة", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue(null); // يرفض المعتمد كما اليوم
    dbMocks.reopenApprovedWard.mockResolvedValue({ studentId: "s1" });

    const res = await PATCH(patchReq({ id: 17, status: "needs_revision", note: "أعد سورة الفيل" }));
    const data = (await res.json()) as { ok?: boolean };

    expect(res.status).toBe(200);
    expect(data?.ok).toBe(true);
    expect(dbMocks.reopenApprovedWard).toHaveBeenCalledWith(1, 17, 2, "أعد سورة الفيل");
    // إخطار قرار الإعادة كالمعتاد — الطالب ثم الأولياء (بوش) بعد الرد
    await afterMocks.lastCallback?.();
    expect(pushMocks.sendPushToStudent).toHaveBeenCalledTimes(1);
    expect(pushMocks.sendPushToParentsOfStudent).toHaveBeenCalledWith(1, "s1", "needs_revision");
  });

  it("لا حصر للمسجِّل في المسار: ورد معتمد سجّله الطالب يُعاد فتحه بالنداء نفسه (قرار المالك Q1 ب)", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue(null);
    dbMocks.reopenApprovedWard.mockResolvedValue({ studentId: "s1" });

    const res = await PATCH(patchReq({ id: 23, status: "needs_revision", note: "ملاحظة" }));

    expect(res.status).toBe(200);
    // المسار لا يقرأ recordedVia أصلاً — القرار داخل reopenApprovedWard (المعتمد فقط)
    expect(dbMocks.reopenApprovedWard).toHaveBeenCalledWith(1, 23, 2, "ملاحظة");
  });

  it("غير المعتمد وغير الموجود: المحاولتان تفشلان ⇒ 404 كاليوم ولا يُجدوَل إشعار", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue(null);
    dbMocks.reopenApprovedWard.mockResolvedValue(null);

    const res = await PATCH(patchReq({ id: 999, status: "needs_revision", note: "ملاحظة" }));

    expect(res.status).toBe(404);
    expect(afterMocks.after).not.toHaveBeenCalled();
  });

  it("new/seen: setWardLogStatus ينجح ولا يُستدعى reopenApprovedWard إطلاقاً", async () => {
    dbMocks.setWardLogStatus.mockResolvedValue({ studentId: "s1" });

    const res = await PATCH(patchReq({ id: 17, status: "needs_revision", note: "ملاحظة" }));

    expect(res.status).toBe(200);
    expect(dbMocks.reopenApprovedWard).not.toHaveBeenCalled();
  });

  it("ملاحظة مفقودة على ورد معتمد: 400 قبل لمس قاعدة البيانات", async () => {
    const res = await PATCH(patchReq({ id: 17, status: "needs_revision" }));

    expect(res.status).toBe(400);
    expect(dbMocks.setWardLogStatus).not.toHaveBeenCalled();
    expect(dbMocks.reopenApprovedWard).not.toHaveBeenCalled();
  });
});

const FAKE_STUDENT = { teacherId: 1, id: "s1", name: "أحمد", halaqahName: "حلقة" };

describe("POST /api/wards — زميل المراجعة (STEP 56)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    dbMocks.listSameDayWardStubs.mockResolvedValue([]);
  });

  it("بلا زميل: لا يُجدوَل أي إشعار زميل، وcreateWardLog يستقبل buddyStudentId=null", async () => {
    dbMocks.createWardLog.mockResolvedValue({ id: 1, previousAttemptId: null });

    const res = await POST(postReq({ hifz: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } } }));

    expect(res.status).toBe(200);
    expect(dbMocks.createWardLog.mock.calls[0][2]).toMatchObject({ buddyStudentId: null });
    expect(afterMocks.after).not.toHaveBeenCalled();
  });

  it("بزميل صحيح: createWardLog يستقبل buddyStudentId، ويُجدوَل إشعار للزميل عبر after()", async () => {
    dbMocks.createWardLog.mockResolvedValue({ id: 1, previousAttemptId: null });

    const res = await POST(
      postReq({
        hifz: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
        buddyStudentId: "s2",
      }),
    );

    expect(res.status).toBe(200);
    expect(dbMocks.createWardLog.mock.calls[0][2]).toMatchObject({ buddyStudentId: "s2" });
    // إشعاران يُجدوَلان: للمعلّم (دائماً) وللزميل (STEP 56) — كلاهما بعد الرد، لا قبله
    expect(afterMocks.after).toHaveBeenCalledTimes(1);
  });

  it("زميل غير صالح (createWardLog ترمي من assertValidBuddy): 400 برسالة الخادم نفسها", async () => {
    dbMocks.createWardLog.mockRejectedValue(new Error("هذا الزميل غير متاح"));

    const res = await POST(
      postReq({
        hifz: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } },
        buddyStudentId: "ghost",
      }),
    );
    const data = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(data.error).toBe("هذا الزميل غير متاح");
    expect(afterMocks.after).not.toHaveBeenCalled();
  });

  it("تجاوز سقف الإرسال (30/ساعة): 429 ولا يُنشأ الورد أصلاً", async () => {
    rateLimitMocks.checkRateLimit.mockResolvedValueOnce(false);

    const res = await POST(postReq({ hifz: { from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } } }));
    const data = (await res.json()) as { error: string };

    expect(res.status).toBe(429);
    expect(data.error).toBe("محاولات كثيرة، حاول لاحقاً");
    expect(dbMocks.createWardLog).not.toHaveBeenCalled();
  });
});

describe("POST /api/wards — حارس التكرار اليومي من جهة الطالب (001 T029، FR-005)", () => {
  const today = new Date().toISOString().slice(0, 10);
  const HIFZ = { from: { surah: 105, ayah: 1 }, to: { surah: 105, ayah: 5 } };

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    dbMocks.createWardLog.mockResolvedValue({ id: 1, previousAttemptId: null });
    dbMocks.listSameDayWardStubs.mockResolvedValue([]);
  });

  it("ورد سجّله المعلّم اليوم: 409 DUPLICATE_TODAY بملخّصه، ولا يُنشأ ورد", async () => {
    dbMocks.listSameDayWardStubs.mockResolvedValue([
      {
        id: 99, date: today, recordedVia: "teacher", status: "approved",
        hifz: { from: 603, to: 603 }, hifzAyah: { fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 },
      },
    ]);

    const res = await POST(postReq({ hifz: HIFZ }));
    const data = (await res.json()) as {
      code?: string;
      error?: string;
      existing?: { id: number; recordedVia: string; status: string; summary: string };
    };

    expect(res.status).toBe(409);
    expect(data.code).toBe("DUPLICATE_TODAY");
    expect(data.existing).toMatchObject({ id: 99, recordedVia: "teacher", status: "approved" });
    expect(data.existing!.summary).toContain("الفيل");
    expect(dbMocks.createWardLog).not.toHaveBeenCalled();
    // الاستعلام بنفس تاريخ الورد المُرسل نفسه
    expect(dbMocks.listSameDayWardStubs).toHaveBeenCalledWith(1, "s1", today);
  });

  it("confirmDuplicate: true يمرّر الحارس ويُنشأ الورد", async () => {
    dbMocks.listSameDayWardStubs.mockResolvedValue([
      { id: 99, date: today, recordedVia: "teacher", status: "approved", hifz: null, hifzAyah: null },
    ]);

    const res = await POST(postReq({ hifz: HIFZ, confirmDuplicate: true }));

    expect(res.status).toBe(200);
    expect(dbMocks.createWardLog).toHaveBeenCalledTimes(1);
  });

  it("ورده هو المعلّق اليوم لا يمنعه — التعديل متاح له من مساره", async () => {
    dbMocks.listSameDayWardStubs.mockResolvedValue([
      { id: 7, date: today, recordedVia: "student", status: "new", hifz: null, hifzAyah: null },
    ]);

    const res = await POST(postReq({ hifz: HIFZ }));

    expect(res.status).toBe(200);
    expect(dbMocks.createWardLog).toHaveBeenCalledTimes(1);
  });

  it("لا أوراد اليوم: يمرّ كالمعتاد", async () => {
    const res = await POST(postReq({ hifz: HIFZ }));

    expect(res.status).toBe(200);
    expect(dbMocks.createWardLog).toHaveBeenCalledTimes(1);
  });
});

/*
  001 T033 — إدخال الحفظ بالصفحات hifzPages (ثانوي/جامعي، FR-006): يُحوَّل
  خادمياً إلى نطاق آيات كامل عبر ayahRangeOfPageRange فيبقى التخزين
  والتحقق كما هما تماماً. hifz وhifzPages معاً ⇒ 400 (عقد ward-changes).
*/
describe("POST/PUT /api/wards — الحفظ بالصفحات hifzPages (001 T033)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    dbMocks.createWardLog.mockResolvedValue({ id: 1, previousAttemptId: null });
    dbMocks.updateWardLog.mockResolvedValue({ updated: true, buddyResetTo: null });
    dbMocks.listSameDayWardStubs.mockResolvedValue([]);
  });

  it("POST بـhifzPages: يُخزَّن بنطاق الآيات الكامل للصفحات — التخزين لا يتغيّر", async () => {
    const res = await POST(postReq({ hifzPages: { from: 502, to: 504 } }));

    expect(res.status).toBe(200);
    const log = dbMocks.createWardLog.mock.calls[0][2];
    expect(log.hifzFrom).toBe(502);
    expect(log.hifzTo).toBe(504);
    expect(log.hifzAyah).toEqual(ayahRangeOfPageRange(502, 504));
  });

  it("hifz وhifzPages معاً: 400 ولا يُنشأ الورد", async () => {
    const res = await POST(
      postReq({ hifzPages: { from: 502, to: 504 }, hifz: { from: { surah: 105, ayah: 1 }, to: { surah: 105, ayah: 5 } } }),
    );
    const data = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(data.error).toBe("ادخل الحفظ بالآيات أو بالصفحات، لا الاثنين معاً");
    expect(dbMocks.createWardLog).not.toHaveBeenCalled();
  });

  it("نطاق صفحات غير صالح (من > إلى): 400 برسالة parseHifzPagesInput نفسها", async () => {
    const res = await POST(postReq({ hifzPages: { from: 504, to: 502 } }));
    const data = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(data.error).toBe("نطاق الصفحات خارج حدود المصحف");
    expect(dbMocks.createWardLog).not.toHaveBeenCalled();
  });

  it("PUT بلا hifz ولا hifzPages (مراجعة فقط): يمرّ كما اليوم", async () => {
    const res = await PUT(
      putReq({ id: 9, date: "2026-10-26", review: [{ from: { surah: 1, ayah: 1 }, to: { surah: 1, ayah: 7 } }] }),
    );

    expect(res.status).toBe(200);
    expect(dbMocks.updateWardLog).toHaveBeenCalledTimes(1);
  });

  it("PUT بـhifzPages: يقبل صفحات الحفظ كذلك ويحوّلها لنطاق آيات", async () => {
    const res = await PUT(putReq({ id: 9, date: "2026-10-26", hifzPages: { from: 604, to: 604 } }));

    expect(res.status).toBe(200);
    const log = dbMocks.updateWardLog.mock.calls[0][3];
    expect(log.hifzFrom).toBe(604);
    expect(log.hifzTo).toBe(604);
    expect(log.hifzAyah).toEqual(ayahRangeOfPageRange(604, 604));
  });
});

/*
  001 T038 — مصفوفة الفئة × المسجِّل ⇒ الحالة الابتدائية (FR-008): ورد
  الطالب يبدأ new دائماً في كل فئة (ينشأ عبر createWardLog التي تُدرج
  status='new' حرفياً — لا مسار اعتماد لورد طالب هنا)؛ خلية الابتدائي
  + معلّم (approved فوراً) في اختبار مسار المعلّم.
*/
describe("POST /api/wards — مصفوفة الفئة × المسجِّل ⇒ الحالة الابتدائية (001 T038)", () => {
  const HIFZ = { from: { surah: 105, ayah: 1 }, to: { surah: 105, ayah: 5 } };

  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.currentStudent.mockResolvedValue(FAKE_STUDENT);
    dbMocks.createWardLog.mockResolvedValue({ id: 1, previousAttemptId: null });
    dbMocks.listSameDayWardStubs.mockResolvedValue([]);
  });

  it.each(["intermediate", "secondary", "university"])(
    "%s + طالب: يمرّ عبر createWardLog — الحالة الابتدائية new دائماً",
    async (stage) => {
      stageDbMocks.getHalaqahStage.mockResolvedValue(stage);

      const res = await POST(postReq({ hifz: HIFZ }));

      expect(res.status).toBe(200);
      expect(dbMocks.createWardLog).toHaveBeenCalledTimes(1);
      // createWardLog تُدرج status='new' حرفياً = initialStatusFor للطالب
      expect(initialStatusFor({ recordedVia: "student" })).toBe("new");
    },
  );

  it("حلقة بلا فئة (افتراضي) + طالب: new كما اليوم تماماً (SC-005)", async () => {
    stageDbMocks.getHalaqahStage.mockResolvedValue(null);

    const res = await POST(postReq({ hifz: HIFZ }));

    expect(res.status).toBe(200);
    expect(dbMocks.createWardLog).toHaveBeenCalledTimes(1);
  });
});
