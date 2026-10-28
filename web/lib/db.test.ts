import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NewWardLog } from "./db";

/*
  اختبار الذرّية (STEP 52، بشرط المستخدم قبل التطبيق): محاولة تعديل ورد
  مقفَل (اعتمده المعلّم أو رفضه) يجب ألا تلمس مقاطع المراجعة إطلاقاً — لا
  حذف ولا إدراج — ويجب أن يُلغى (ROLLBACK) كامل الترانزاكشن. نحاكي
  @netlify/database بعميل pg وهمي نتحكّم بردّه على كل استعلام، فنثبت هذا
  دون الاتصال بقاعدة بيانات حقيقية: أي ورد "مقفَل" في الإنتاج تُرجع جملة
  UPDATE الموصوفة بشرط WHERE ...status IN ('new','seen')) صفر صفوف بالضبط
  — فنحاكي هذا الرد ونتحقّق من أن الكود يتصرّف تماماً كما لو كان يتحدّث
  لقاعدة بيانات حقيقية.
*/

type FakeQuery = ReturnType<typeof vi.fn>;

function makeFakeClient(updateRowCount: number) {
  const calls: { text: string; params?: unknown[] }[] = [];
  const query: FakeQuery = vi.fn(async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    if (text.trim().startsWith("UPDATE ward_logs")) {
      return { rowCount: updateRowCount, rows: [] };
    }
    return { rowCount: 0, rows: [] };
  });
  return { query, calls, release: vi.fn() };
}

const connectMock = vi.fn();
const sqlMock = vi.fn();

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    pool: { connect: connectMock },
    sql: sqlMock,
  }),
}));

const {
  carryOverReviewTracks,
  createApprovedWardLog,
  createWardLog,
  reopenApprovedWard,
  updateWardLog,
  setWardReviewTracks,
  listHalaqahMates,
  listPendingBuddyRequestsForStudent,
  listWardLogs,
  respondToBuddyRequest,
} = await import("./db");

const sampleLog: NewWardLog = {
  date: "2026-09-27",
  hifzFrom: null,
  hifzTo: null,
  reviewFrom: 1,
  reviewTo: 5,
  hifzAyah: null,
  reviewAyah: null,
  reviewSegments: [{ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, fromPage: 1, toPage: 1 }],
  note: "",
};

describe("updateWardLog — الذرّية وقفل الورد المعتمد (STEP 52)", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  it("ورد مقفَل (UPDATE يرجع صفر صفوف): لا حذف ولا إدراج لمقاطع المراجعة، وROLLBACK لا COMMIT", async () => {
    const client = makeFakeClient(0);
    connectMock.mockResolvedValue(client);

    const result = await updateWardLog(2, "student-1", 17, sampleLog);

    expect(result).toEqual({ updated: false, buddyResetTo: null });
    const texts = client.calls.map((c) => c.text.trim());
    // لازم UPDATE واحدة فقط، ثم ROLLBACK مباشرة — بلا أي DELETE أو INSERT على ward_review_segments
    expect(texts.some((t) => t.startsWith("DELETE FROM ward_review_segments"))).toBe(false);
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_segments"))).toBe(false);
    expect(texts).toContain("ROLLBACK");
    expect(texts).not.toContain("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("ورد قابل للتعديل (UPDATE يرجع صفاً واحداً): يستبدل المقاطع ويُنهي بـCOMMIT", async () => {
    const client = makeFakeClient(1);
    connectMock.mockResolvedValue(client);

    const result = await updateWardLog(2, "student-1", 17, sampleLog);

    expect(result).toEqual({ updated: true, buddyResetTo: null });
    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.startsWith("DELETE FROM ward_review_segments"))).toBe(true);
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_segments"))).toBe(true);
    expect(texts).toContain("COMMIT");
    expect(texts).not.toContain("ROLLBACK");
  });

  it("جملة UPDATE نفسها تفرض status = 'new' دائماً (لو كانت seen ترجع new)", async () => {
    const client = makeFakeClient(1);
    connectMock.mockResolvedValue(client);

    await updateWardLog(2, "student-1", 17, sampleLog);

    const updateCall = client.calls.find((c) => c.text.trim().startsWith("UPDATE ward_logs"));
    expect(updateCall?.text).toContain("status = 'new'");
    expect(updateCall?.text).toContain("status IN ('new', 'seen')");
  });
});

/*
  STEP 56 — زميل المراجعة: الفحص هنا على طبقة التطبيق (assertValidBuddy
  وما يبنيه createWardLog/updateWardLog من استعلامات) — "نفس الحلقة
  فقط" مضمونة فعلياً من قيدَي FK بقاعدة البيانات نفسها (migration.sql)،
  لا من هذا الفحص وحده؛ هذي الطبقة فقط رسالة خطأ عربية واضحة قبل وصول
  أي شيء لقاعدة البيانات، وتُثبت أن طلباً غير صالح لا يفتح حتى اتصالاً
  بقاعدة البيانات (pool.connect لا يُستدعى إطلاقاً).
*/
function buddySampleLog(buddyStudentId: string | null): NewWardLog {
  return { ...sampleLog, buddyStudentId };
}

/** sqlMock يميّز بين استعلام "هل الزميل صالح" واستعلام "محاولة إعادة مفتوحة" بنص الاستعلام نفسه */
function mockBuddyValidation(buddyExists: boolean) {
  sqlMock.mockImplementation((strings: TemplateStringsArray) => {
    const text = strings.join("");
    if (text.includes("FROM students")) return Promise.resolve(buddyExists ? [{ x: 1 }] : []);
    return Promise.resolve([]); // findOpenRevisionAttempt وغيره — لا محاولة سابقة مفتوحة
  });
}

describe("createWardLog / updateWardLog — زميل المراجعة (STEP 56)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    connectMock.mockReset();
  });

  it("اختيار النفس: يفشل قبل فتح أي اتصال بقاعدة البيانات", async () => {
    mockBuddyValidation(true);
    await expect(createWardLog(2, "student-1", buddySampleLog("student-1"))).rejects.toThrow(
      "لا يمكن اختيار نفسك زميلاً",
    );
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("زميل غير موجود/محذوف/غير نشط (الاستعلام يرجع صفراً): يفشل، ولا اتصال بقاعدة البيانات", async () => {
    mockBuddyValidation(false);
    await expect(createWardLog(2, "student-1", buddySampleLog("ghost"))).rejects.toThrow("هذا الزميل غير متاح");
    expect(connectMock).not.toHaveBeenCalled();
  });

  it("زميل صالح (نفس الحلقة، نشِط): يُدرج صفّ زميل بحالة pending داخل نفس الترانزاكشن", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClient(1);
    connectMock.mockResolvedValue(client);
    client.query.mockImplementation(async (text: string, params?: unknown[]) => {
      client.calls.push({ text, params });
      if (text.trim().startsWith("INSERT INTO ward_logs")) return { rows: [{ id: 42 }] };
      return { rowCount: 1, rows: [] };
    });

    await createWardLog(2, "student-1", buddySampleLog("buddy-1"));

    const insertCall = client.calls.find((c) => c.text.trim().startsWith("INSERT INTO ward_review_buddies"));
    expect(insertCall).toBeDefined();
    expect(insertCall?.text).toContain("'pending'");
    expect(insertCall?.params).toEqual([42, 2, "student-1", "buddy-1"]);
  });

  it("بلا زميل: لا يُدرج أي صفّ بـward_review_buddies", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClient(1);
    connectMock.mockResolvedValue(client);
    client.query.mockImplementation(async (text: string, params?: unknown[]) => {
      client.calls.push({ text, params });
      if (text.trim().startsWith("INSERT INTO ward_logs")) return { rows: [{ id: 42 }] };
      return { rowCount: 1, rows: [] };
    });

    await createWardLog(2, "student-1", buddySampleLog(null));

    expect(client.calls.some((c) => c.text.trim().startsWith("INSERT INTO ward_review_buddies"))).toBe(false);
  });

  /** عميل تعديل يحاكي أيضاً SELECT buddy_student_id الحالي قبل أي حذف/إدراج (STEP 56 تصحيح) */
  function makeFakeClientWithExistingBuddy(updateRowCount: number, existingBuddyId: string | null) {
    const client = makeFakeClient(updateRowCount);
    const original = client.query.getMockImplementation() as (text: string, params?: unknown[]) => Promise<unknown>;
    client.query.mockImplementation(async (text: string, params?: unknown[]) => {
      if (text.trim().startsWith("SELECT buddy_student_id")) {
        client.calls.push({ text, params });
        return { rows: existingBuddyId ? [{ buddy_student_id: existingBuddyId }] : [], rowCount: existingBuddyId ? 1 : 0 };
      }
      return original(text, params);
    });
    return client;
  }

  it("تغيير الزميل لزميل آخر: يحذف صفّ الزميل القديم ثم يُدرج صفّاً جديداً بحالة pending — إعادة فعلية للحالة", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClientWithExistingBuddy(1, "buddy-1");
    connectMock.mockResolvedValue(client);

    await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-2"));

    const texts = client.calls.map((c) => c.text.trim());
    const deleteIdx = texts.findIndex((t) => t.startsWith("DELETE FROM ward_review_buddies"));
    const insertIdx = texts.findIndex((t) => t.startsWith("INSERT INTO ward_review_buddies"));
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(deleteIdx);
    expect(texts[insertIdx]).toContain("'pending'");
  });

  it("نفس الزميل بلا تغيير (buddy-1 → buddy-1): لا حذف ولا إدراج إطلاقاً — الحالة تبقى كما هي (confirmed تبقى confirmed)", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClientWithExistingBuddy(1, "buddy-1");
    connectMock.mockResolvedValue(client);

    await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-1"));

    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.startsWith("DELETE FROM ward_review_buddies"))).toBe(false);
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_buddies"))).toBe(false);
  });

  it("إزالة الزميل (buddyStudentId=null) من ورد له زميل سابقاً: يحذف فقط، بلا إدراج جديد", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClientWithExistingBuddy(1, "buddy-1");
    connectMock.mockResolvedValue(client);

    await updateWardLog(2, "student-1", 17, buddySampleLog(null));

    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.startsWith("DELETE FROM ward_review_buddies"))).toBe(true);
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_buddies"))).toBe(false);
  });

  it("إضافة زميل لورد لم يكن له زميل سابقاً (null → buddy-1): يُدرج بحالة pending", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClientWithExistingBuddy(1, null);
    connectMock.mockResolvedValue(client);

    await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-1"));

    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_buddies"))).toBe(true);
  });

  it("ورد مقفَل (UPDATE الرئيسية ترجع صفر صفوف): لا يلمس ward_review_buddies إطلاقاً", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClient(0);
    connectMock.mockResolvedValue(client);

    await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-2"));

    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.includes("ward_review_buddies"))).toBe(false);
  });
});

/*
  خيار الحلقة (buddy_reset_on_edit): إعادة طلب تأكيد الزميل عند تعديل
  الورد. نحاكي العميل بالردّ على كل استعلام جديد — قراءة الخيار، قراءة
  المحتوى القديم، وقراءة حالة الزميل — ونتحقّق من قرار إعادة الطلب
  (UPDATE الصف نفسه، لا حذف+إدراج) بناءً على تركيبة الشروط.
*/
function makeBuddyResetClient({
  setting,
  oldContent,
  buddyId,
  buddyStatus,
}: {
  setting: boolean;
  oldContent: Record<string, unknown> | null;
  buddyId: string | null;
  buddyStatus: "pending" | "confirmed" | "declined";
}) {
  const client = makeFakeClient(1);
  const original = client.query.getMockImplementation() as (text: string, params?: unknown[]) => Promise<unknown>;
  client.query.mockImplementation(async (text: string, params?: unknown[]) => {
    const trimmed = text.trim();
    if (trimmed.startsWith("SELECT buddy_reset_on_edit")) {
      client.calls.push({ text, params });
      return { rowCount: setting ? 1 : 0, rows: [{ buddy_reset_on_edit: setting }] };
    }
    if (trimmed.startsWith("SELECT w.date")) {
      client.calls.push({ text, params });
      return { rowCount: oldContent ? 1 : 0, rows: oldContent ? [oldContent] : [] };
    }
    if (trimmed.startsWith("SELECT buddy_student_id")) {
      client.calls.push({ text, params });
      return {
        rowCount: buddyId ? 1 : 0,
        rows: buddyId ? [{ buddy_student_id: buddyId, status: buddyStatus }] : [],
      };
    }
    return original(text, params);
  });
  return client;
}

/** صف محتوى قديم مطابق لـsampleLog بالضبط (أو يعدّله changed لمغايرته) */
function oldContentRow(changed: boolean): Record<string, unknown> {
  return {
    date: changed ? "2026-09-28" : "2026-09-27",
    hifz_from: null,
    hifz_to: null,
    review_from: 1,
    review_to: changed ? 9 : 5,
    hifz_from_surah: null,
    hifz_from_ayah: null,
    hifz_to_surah: null,
    hifz_to_ayah: null,
    review_from_surah: null,
    review_from_ayah: null,
    review_to_surah: null,
    review_to_ayah: null,
    review_segments_json: JSON.stringify([
      { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, fromPage: 1, toPage: 1 },
    ]),
  };
}

describe("updateWardLog — إعادة تأكيد الزميل عند التعديل (خيار الحلقة)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    connectMock.mockReset();
  });

  it("الخيار مغلق + تغيير محتوى + تأكيد سابق: لا يُعاد الطلب — السلوك الحالي كما هو", async () => {
    mockBuddyValidation(true);
    const client = makeBuddyResetClient({ setting: false, oldContent: null, buddyId: "buddy-1", buddyStatus: "confirmed" });
    connectMock.mockResolvedValue(client);

    const result = await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-1"));

    expect(result).toEqual({ updated: true, buddyResetTo: null });
    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.startsWith("UPDATE ward_review_buddies"))).toBe(false);
    expect(texts.some((t) => t.startsWith("DELETE FROM ward_review_buddies"))).toBe(false);
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_buddies"))).toBe(false);
    // الخيار مغلق: المحتوى القديم لا يُقرأ أصلاً — بلا أي استعلام إضافي
    expect(texts.some((t) => t.startsWith("SELECT w.date"))).toBe(false);
  });

  it("الخيار مفعّل + تغيير محتوى + تأكيد سابق: الصف نفسه يعود pending بلا حذف/إدراج", async () => {
    mockBuddyValidation(true);
    const client = makeBuddyResetClient({ setting: true, oldContent: oldContentRow(true), buddyId: "buddy-1", buddyStatus: "confirmed" });
    connectMock.mockResolvedValue(client);

    const result = await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-1"));

    expect(result).toEqual({ updated: true, buddyResetTo: "buddy-1" });
    const resetCall = client.calls.find((c) => c.text.trim().startsWith("UPDATE ward_review_buddies"));
    expect(resetCall?.text).toContain("status = 'pending'");
    expect(resetCall?.text).toContain("responded_at = NULL");
    expect(resetCall?.params).toEqual([17, 2]);
    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.startsWith("DELETE FROM ward_review_buddies"))).toBe(false);
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_buddies"))).toBe(false);
    expect(texts).toContain("COMMIT");
  });

  it("رفض سابق (declined) يُعاد أيضاً — الاثنان استجابة قديمة على محتوى تغيّر", async () => {
    mockBuddyValidation(true);
    const client = makeBuddyResetClient({ setting: true, oldContent: oldContentRow(true), buddyId: "buddy-1", buddyStatus: "declined" });
    connectMock.mockResolvedValue(client);

    const result = await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-1"));

    expect(result).toEqual({ updated: true, buddyResetTo: "buddy-1" });
    expect(client.calls.some((c) => c.text.trim().startsWith("UPDATE ward_review_buddies"))).toBe(true);
  });

  it("الخيار مفعّل بلا تغيير محتوى فعلي: لا يُلمس صفّ الزميل إطلاقاً", async () => {
    mockBuddyValidation(true);
    const client = makeBuddyResetClient({ setting: true, oldContent: oldContentRow(false), buddyId: "buddy-1", buddyStatus: "confirmed" });
    connectMock.mockResolvedValue(client);

    const result = await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-1"));

    expect(result).toEqual({ updated: true, buddyResetTo: null });
    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.startsWith("UPDATE ward_review_buddies"))).toBe(false);
    expect(texts.some((t) => t.startsWith("DELETE FROM ward_review_buddies"))).toBe(false);
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_buddies"))).toBe(false);
  });

  it("الطلب ما زال pending أصلاً: لا إعادة — الحالة هدفها نفسه", async () => {
    mockBuddyValidation(true);
    const client = makeBuddyResetClient({ setting: true, oldContent: oldContentRow(true), buddyId: "buddy-1", buddyStatus: "pending" });
    connectMock.mockResolvedValue(client);

    const result = await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-1"));

    expect(result).toEqual({ updated: true, buddyResetTo: null });
    expect(client.calls.some((c) => c.text.trim().startsWith("UPDATE ward_review_buddies"))).toBe(false);
  });
});

describe("listHalaqahMates / listPendingBuddyRequestsForStudent / respondToBuddyRequest (STEP 56)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("listHalaqahMates يرجع الاسم والمعرّف فقط — بلا أي حقل آخر", async () => {
    sqlMock.mockResolvedValue([{ id: "s2", name: "محمد" }]);
    expect(await listHalaqahMates(1, "s1")).toEqual([{ id: "s2", name: "محمد" }]);
  });

  it("listPendingBuddyRequestsForStudent يرجع اسم الطالب الطالب والتاريخ فقط", async () => {
    sqlMock.mockResolvedValue([{ ward_log_id: 5, requester_name: "أحمد", date: "2026-09-29" }]);
    expect(await listPendingBuddyRequestsForStudent(1, "s2")).toEqual([
      { wardLogId: 5, requesterName: "أحمد", date: "2026-09-29" },
    ]);
  });

  it("respondToBuddyRequest: تأكيد ينجح لصاحب الطلب الصحيح (status='pending' → صف واحد)", async () => {
    sqlMock.mockResolvedValue([{ id: 9 }]);
    expect(await respondToBuddyRequest(1, "s2", 5, true)).toBe(true);
  });

  it("طالب ثالث (buddy_student_id لا يطابق جلسته) أو ورد غير موجود: صفر صفوف → false", async () => {
    sqlMock.mockResolvedValue([]);
    expect(await respondToBuddyRequest(1, "s3", 5, true)).toBe(false);
  });

  it("تأكيد مرتين: الثانية لا تجد صفاً بحالة pending بعد الآن → false", async () => {
    // المحاولة الأولى نجحت (status صار confirmed) — محاكاة الثانية مباشرة:
    // الاستعلام بشرط status='pending' صار يرجع صفراً لأن الصف تغيّرت حالته فعلياً
    sqlMock.mockResolvedValue([]);
    expect(await respondToBuddyRequest(1, "s2", 5, true)).toBe(false);
  });
});

/*
  STEP 55 — البلاغ ومرفقاته (صور) في ترانزاكشن واحدة: فشل إدراج أي صورة
  يجب أن يُلغي البلاغ نفسه بالكامل (ROLLBACK)، لا أن يُنشئ بلاغاً بلا
  الصور التي ظنّ المرسل أنها أُرفقت.
*/
const { addStudentSuggestion, addSuggestion, checkStudentSuggestionRateLimit } = await import("./db");

describe("checkStudentSuggestionRateLimit — سقف ٥ بالساعة لكل طالب (STEP 55)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("دون السقف (٤ خلال الساعة الماضية): مسموح", async () => {
    sqlMock.mockResolvedValue([{ n: "4" }]);
    expect(await checkStudentSuggestionRateLimit(1, "s1")).toBe(true);
  });

  it("عند السقف بالضبط (٥): ممنوع", async () => {
    sqlMock.mockResolvedValue([{ n: "5" }]);
    expect(await checkStudentSuggestionRateLimit(1, "s1")).toBe(false);
  });
});

type SuggestionFakeClientOptions = { suggestionId: number; failOnAttachmentIndex?: number };

function makeSuggestionFakeClient({ suggestionId, failOnAttachmentIndex }: SuggestionFakeClientOptions) {
  const calls: { text: string; params?: unknown[] }[] = [];
  let attachmentCount = 0;
  const query: FakeQuery = vi.fn(async (text: string, params?: unknown[]) => {
    calls.push({ text, params });
    const trimmed = text.trim();
    if (trimmed.startsWith("INSERT INTO student_suggestions") || trimmed.startsWith("INSERT INTO suggestions")) {
      return { rows: [{ id: suggestionId }] };
    }
    if (trimmed.startsWith("INSERT INTO suggestion_attachments")) {
      const index = attachmentCount++;
      if (failOnAttachmentIndex === index) throw new Error("simulated attachment insert failure");
      return { rows: [] };
    }
    return { rows: [] };
  });
  return { query, calls, release: vi.fn() };
}

const sampleImage = { mime: "image/webp" as const, bytes: Buffer.from("x"), sizeBytes: 1, width: 10, height: 10 };

describe("addStudentSuggestion — البلاغ ومرفقاته في ترانزاكشن واحدة (STEP 55)", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  it("ينجح ويُدرج كل الصور ثم COMMIT عندما لا يفشل شيء", async () => {
    const client = makeSuggestionFakeClient({ suggestionId: 42 });
    connectMock.mockResolvedValue(client);

    const id = await addStudentSuggestion(1, "s1", "bug", "عندي مشكلة", [sampleImage, sampleImage]);

    expect(id).toBe(42);
    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.filter((t) => t.startsWith("INSERT INTO suggestion_attachments")).length).toBe(2);
    expect(texts).toContain("COMMIT");
    expect(texts).not.toContain("ROLLBACK");
  });

  it("فشل إدراج صورة ثانية يُلغي البلاغ بالكامل (ROLLBACK) لا نصف بلاغ بصورة واحدة", async () => {
    const client = makeSuggestionFakeClient({ suggestionId: 42, failOnAttachmentIndex: 1 });
    connectMock.mockResolvedValue(client);

    await expect(
      addStudentSuggestion(1, "s1", "bug", "عندي مشكلة", [sampleImage, sampleImage, sampleImage]),
    ).rejects.toThrow("simulated attachment insert failure");

    const texts = client.calls.map((c) => c.text.trim());
    // الصورة الثالثة لا تصل حتى — التوقف عند أول فشل
    expect(texts.filter((t) => t.startsWith("INSERT INTO suggestion_attachments")).length).toBe(2);
    expect(texts).toContain("ROLLBACK");
    expect(texts).not.toContain("COMMIT");
  });
});

describe("addSuggestion (معلّم) — نفس مبدأ الترانزاكشن الواحدة (STEP 55ب)", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  it("فشل إدراج الصورة يُلغي بلاغ المعلّم بالكامل أيضاً", async () => {
    const client = makeSuggestionFakeClient({ suggestionId: 7, failOnAttachmentIndex: 0 });
    connectMock.mockResolvedValue(client);

    await expect(addSuggestion(2, "حلقة (u)", "عندي مشكلة", "problem", [sampleImage])).rejects.toThrow(
      "simulated attachment insert failure",
    );

    const texts = client.calls.map((c) => c.text.trim());
    expect(texts).toContain("ROLLBACK");
    expect(texts).not.toContain("COMMIT");
  });
});

/*
  STEP 60 — إيقاف المساعد من مشرف حلقته: الإيقاف طابع زمني + رفع نسخة
  الجلسة (فسقوط الجلسات القائمة فوري ومزدوج الآلية)، والتفعيل يعيد العمود
  NULL فقط بلا أي مساس بالنسخة. نتحقق من نصّي الجملتين لأن أثرهما هو
  الضمانة الأمنية نفسها، ومن رفض دخول جوجل للحساب الموقوف.
*/
const { findOrCreateTeacherByEmail, setAssistantActive } = await import("./db");

function sqlTextOfCall(call: unknown): string {
  return ((call as unknown[])[0] as TemplateStringsArray).join("").trim();
}

describe("setAssistantActive — إيقاف/تفعيل المساعد (STEP 60)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("الإيقاف: يسجّل deactivated_at ويرفع نسخة الجلسة معاً — جلساته تسقط فوراً", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 5 }]);
    expect(await setAssistantActive(7, 5, false)).toBe(true);

    const sql = sqlTextOfCall(sqlMock.mock.calls[0]);
    expect(sql).toContain("deactivated_at = now()");
    expect(sql).toContain("session_version = session_version + 1");
    expect(sql).toContain("role = 'assistant'");
    // المعاملات المُمرَّرة: (المعرّف، الحلقة) بترتيب ظهورهما بالجملة
    expect(sqlMock.mock.calls[0].slice(1)).toEqual([5, 7]);
  });

  it("التفعيل: يعيد العمود NULL ولا يرفع نسخة الجلسة — لا جلسات له أصلاً", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 5 }]);
    expect(await setAssistantActive(7, 5, true)).toBe(true);

    const sql = sqlTextOfCall(sqlMock.mock.calls[0]);
    expect(sql).toContain("deactivated_at = NULL");
    expect(sql).not.toContain("session_version");
  });

  it("صفر صفوف (مشرف/حلقة أخرى/نفسه): false", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await setAssistantActive(7, 5, false)).toBe(false);
  });
});

describe("findOrCreateTeacherByEmail — الحساب الموقوف (STEP 60)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("حساب قائم موقوف: يُرفض دخول جوجل برسالة الإيقاف قبل أي تحديث", async () => {
    sqlMock.mockResolvedValueOnce([
      {
        id: 5,
        username: "a@b.c",
        password_hash: "x",
        teacher_name: "مساعد",
        halaqah_id: 7,
        halaqah_name: "الحلقة",
        role: "assistant",
        email_verified: true,
        session_version: 0,
        deactivated_at: "2026-10-14T00:00:00.000Z",
      },
    ]);

    await expect(findOrCreateTeacherByEmail("a@b.c")).rejects.toThrow("تم إيقاف حسابك من مشرف الحلقة");
    expect(sqlMock).toHaveBeenCalledTimes(1); // لا UPDATE إطلاقاً بعد الرفض
  });
});

describe("updateWardLog — حفظ تصنيفات المقاطع عند غياب reviewTracks (B3)", () => {
  beforeEach(() => {
    connectMock.mockReset();
  });

  const prior = [
    { segment_order: 1, from_surah: 1, from_ayah: 1, to_surah: 1, to_ayah: 7, track: "sabqi" as const },
    { segment_order: 2, from_surah: 2, from_ayah: 1, to_surah: 2, to_ayah: 5, track: "manzil" as const },
  ];

  it("carryOverReviewTracks: يحمل التصنيف للمقطع الباقي بموضعه ونطاقه، وصفراً لما تغيّر", () => {
    const next = [
      { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, fromPage: 1, toPage: 1 },
      { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 9, fromPage: 2, toPage: 2 }, // نطاق تغيّر
      { fromSurah: 3, fromAyah: 1, toSurah: 3, toAyah: 2, fromPage: 50, toPage: 50 }, // مقطع جديد
    ];
    expect(carryOverReviewTracks(prior, next)).toEqual(["sabqi", null, null]);
  });

  it("carryOverReviewTracks: تغيّر الموضع = لا حمل", () => {
    const swapped = [
      { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5, fromPage: 2, toPage: 2 },
      { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, fromPage: 1, toPage: 1 },
    ];
    expect(carryOverReviewTracks(prior, swapped)).toEqual([null, null]);
  });

  function clientWithPrior() {
    const client = makeFakeClient(1);
    client.query.mockImplementation(async (text: string, params?: unknown[]) => {
      client.calls.push({ text, params });
      if (text.trim().startsWith("UPDATE ward_logs")) return { rowCount: 1, rows: [] };
      if (text.includes("FROM ward_review_segments WHERE ward_log_id") && text.includes("SELECT segment_order")) {
        return { rowCount: 2, rows: prior };
      }
      return { rowCount: 0, rows: [] };
    });
    return client;
  }

  it("PUT بلا reviewTracks والمقاطع كما هي: يُدرج المقاطع بتصنيفاتها القديمة", async () => {
    const client = clientWithPrior();
    connectMock.mockResolvedValue(client);
    const log: NewWardLog = {
      ...sampleLog,
      reviewSegments: [
        { fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, fromPage: 1, toPage: 1 },
        { fromSurah: 2, fromAyah: 1, toSurah: 2, toAyah: 5, fromPage: 2, toPage: 2 },
      ],
    };
    await updateWardLog(2, "student-1", 17, log);
    const inserts = client.calls.filter((c) => c.text.trim().startsWith("INSERT INTO ward_review_segments"));
    expect(inserts.map((c) => c.params?.[8])).toEqual(["sabqi", "manzil"]);
    // القراءة تسبق الحذف
    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.findIndex((t) => t.startsWith("SELECT segment_order"))).toBeLessThan(
      texts.findIndex((t) => t.startsWith("DELETE FROM ward_review_segments")),
    );
  });

  it("تصنيفات صريحة (حتى null) تُطبَّق كما هي ولا تُقرأ القديمة", async () => {
    const client = clientWithPrior();
    connectMock.mockResolvedValue(client);
    await updateWardLog(2, "student-1", 17, {
      ...sampleLog,
      reviewSegments: [{ fromSurah: 1, fromAyah: 1, toSurah: 1, toAyah: 7, fromPage: 1, toPage: 1 }],
      reviewSegmentTracks: ["manzil"],
    });
    const insert = client.calls.find((c) => c.text.trim().startsWith("INSERT INTO ward_review_segments"));
    expect(insert?.params?.[8]).toBe("manzil");
    expect(client.calls.some((c) => c.text.trim().startsWith("SELECT segment_order"))).toBe(false);
  });
});

describe("setWardReviewTracks — قفل صف الورد قبل فحص الحالة", () => {
  it("SELECT status ... FOR UPDATE داخل معاملة قبل أي UPDATE", async () => {
    const client = makeFakeClient(1);
    client.query.mockImplementation(async (text: string, params?: unknown[]) => {
      client.calls.push({ text, params });
      if (text.includes("SELECT status FROM ward_logs")) return { rows: [{ status: "new" }] };
      if (text.includes("SELECT segment_order")) return { rows: [{ segment_order: 1 }] };
      return { rows: [], rowCount: 1 };
    });
    connectMock.mockResolvedValue(client);
    expect(await setWardReviewTracks(2, 17, ["sabqi"])).toBe("ok");
    const texts = client.calls.map((c) => c.text.trim());
    const begin = texts.indexOf("BEGIN");
    const lock = texts.findIndex((t) => t.includes("SELECT status FROM ward_logs") && t.endsWith("FOR UPDATE"));
    const upd = texts.findIndex((t) => t.startsWith("UPDATE ward_review_segments"));
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(begin);
    expect(upd).toBeGreaterThan(lock);
  });
});

describe("قراءة الأوراد — recordedVia (001 T014)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  function wardRow(overrides: Record<string, unknown>) {
    return {
      id: 1,
      student_id: "s1",
      student_name: "طالب",
      date: "2026-10-26",
      hifz_from: null,
      hifz_to: null,
      review_from: null,
      review_to: null,
      hifz_from_surah: null,
      hifz_from_ayah: null,
      hifz_to_surah: null,
      hifz_to_ayah: null,
      review_from_surah: null,
      review_from_ayah: null,
      review_to_surah: null,
      review_to_ayah: null,
      note: "",
      status: "approved",
      created_at: "x",
      previous_attempt_id: null,
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      ...overrides,
    };
  }

  it("recorded_via NULL (ورد قديم) تُقرأ «student»، وأورد المعلّم تُقرأ كما هي", async () => {
    sqlMock.mockResolvedValue([
      wardRow({ id: 1, recorded_by_teacher_id: null, recorded_via: null }),
      wardRow({ id: 2, recorded_by_teacher_id: 5, recorded_via: "teacher" }),
      wardRow({ id: 3, recorded_by_teacher_id: 5, recorded_via: "queue" }),
    ]);
    const logs = await listWardLogs(2);
    expect(logs[0]).toMatchObject({ id: 1, recordedVia: "student", recordedByTeacherId: null });
    expect(logs[1]).toMatchObject({ id: 2, recordedVia: "teacher", recordedByTeacherId: 5 });
    expect(logs[2]).toMatchObject({ id: 3, recordedVia: "queue", recordedByTeacherId: 5 });
  });
});

describe("createApprovedWardLog — ورد معتمد باسم المسجِّل (001 T015)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    connectMock.mockReset();
    sqlMock.mockResolvedValue([]); // لا محاولة إعادة مفتوحة، ولا زميل (بلا buddyStudentId)
  });

  function insertClient(id: number) {
    const client = makeFakeClient(1);
    client.query.mockImplementation(async (text: string, params?: unknown[]) => {
      client.calls.push({ text, params });
      if (text.trim().startsWith("INSERT INTO ward_logs")) return { rows: [{ id }] };
      return { rowCount: 1, rows: [] };
    });
    return client;
  }

  it("يُدرج status='approved' مع المسجِّل وصاحب القرار بمعاملة واحدة", async () => {
    const client = insertClient(77);
    connectMock.mockResolvedValue(client);

    const result = await createApprovedWardLog(2, "student-1", sampleLog, { recordedVia: "teacher", recordedByTeacherId: 2 });

    expect(result).toEqual({ id: 77, previousAttemptId: null });
    const insertCall = client.calls.find((c) => c.text.trim().startsWith("INSERT INTO ward_logs"));
    expect(insertCall?.text).toContain("'approved'");
    expect(insertCall?.params?.[18]).toBe(2); // reviewed_by = من سجّل
    expect(insertCall?.params?.[20]).toBe(2); // recorded_by_teacher_id
    expect(insertCall?.params?.[21]).toBe("teacher"); // recorded_via
    // المقاطع تُدرج داخل المعاملة نفسها (نفس createWardLog)
    expect(client.calls.some((c) => c.text.trim().startsWith("INSERT INTO ward_review_segments"))).toBe(true);
    const texts = client.calls.map((c) => c.text.trim());
    expect(texts).toContain("BEGIN");
    expect(texts).toContain("COMMIT");
    expect(texts).not.toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("client خارجي (لمعاملة الطابور 002): يُدرج بدونه BEGIN/COMMIT ولا يُتخلَّص من الاتصال", async () => {
    const client = insertClient(78);
    // غلاف بنفس توقيع المعاملة الخارجية — التسجيل يبقى داخل client.query
    const query = client.query as unknown as (text: string, params?: unknown[]) => Promise<unknown>;
    const txClient = { query };

    const result = await createApprovedWardLog(2, "student-1", sampleLog, { recordedVia: "queue", recordedByTeacherId: 9 }, txClient);

    expect(result.id).toBe(78);
    expect(client.calls.find((c) => c.text.trim().startsWith("INSERT INTO ward_logs"))?.params?.[21]).toBe("queue");
    const texts = client.calls.map((c) => c.text.trim());
    expect(texts).not.toContain("BEGIN");
    expect(texts).not.toContain("COMMIT");
    expect(client.release).not.toHaveBeenCalled();
  });

  it("يربط محاولة الإعادة المفتوحة كـprevious_attempt_id كما في createWardLog", async () => {
    sqlMock.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("SELECT id FROM ward_logs") && text.includes("needs_revision")) {
        return Promise.resolve([{ id: 55 }]);
      }
      return Promise.resolve([]);
    });
    const client = insertClient(79);
    connectMock.mockResolvedValue(client);

    const result = await createApprovedWardLog(2, "student-1", sampleLog, { recordedVia: "teacher", recordedByTeacherId: 2 });

    expect(result.previousAttemptId).toBe(55);
    expect(client.calls.find((c) => c.text.trim().startsWith("INSERT INTO ward_logs"))?.params?.[17]).toBe(55);
  });

  it("زميل غير صالح: يفشل قبل فتح أي اتصال بقاعدة البيانات (نفس حارس createWardLog)", async () => {
    sqlMock.mockImplementation((strings: TemplateStringsArray) => {
      const text = strings.join("");
      if (text.includes("FROM students")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    await expect(
      createApprovedWardLog(2, "student-1", { ...sampleLog, buddyStudentId: "ghost" }, { recordedVia: "teacher", recordedByTeacherId: 2 }),
    ).rejects.toThrow("هذا الزميل غير متاح");
    expect(connectMock).not.toHaveBeenCalled();
  });
});

/*
  001 T036 — إعادة فتح ورد معتمد إلى needs_revision (FR-009): قرار المالك
  Q1 (ب) كل ورد معتمد يقبل إعادة الفتح أيّاً كان مسجِّله (طالب/معلّم/طابور)،
  بملاحظة إلزامية. شرط «المعتمد فقط» داخل جملة UPDATE نفسها.
*/
describe("reopenApprovedWard — إعادة فتح المعتمد (001 T036)", () => {
  beforeEach(() => {
    sqlMock.mockReset();
  });

  it("ورد معتمد: يتحوّل لneeds_revision بملاحظته وباسم المعلّم المُعيد للفتح — أيّاً كان مسجِّله (Q1 ب)", async () => {
    sqlMock.mockResolvedValue([{ student_id: "s1" }]);

    const result = await reopenApprovedWard(2, 17, 5, "راجع الصفحة ٤٥ مرة أخرى");

    expect(result).toEqual({ studentId: "s1" });
    const sql = sqlTextOfCall(sqlMock.mock.calls[0]);
    expect(sql).toContain("needs_revision");
    expect(sql).toContain("status = 'approved'"); // المعتمد فقط — شرط داخل الاستعلام
    expect(sqlMock.mock.calls[0].slice(1)).toContain("راجع الصفحة ٤٥ مرة أخرى");
    expect(sqlMock.mock.calls[0].slice(1)).toContain(5); // reviewed_by
  });

  it("غير المعتمد (أو غير الموجود/حلقة أخرى): null بلا تمييز", async () => {
    sqlMock.mockResolvedValue([]);

    expect(await reopenApprovedWard(2, 17, 5, "ملاحظة")).toBeNull();
  });

  it("ملاحظة فارغة: خطأ عربي قبل أي استعلام", async () => {
    await expect(reopenApprovedWard(2, 17, 5, "   ")).rejects.toThrow(
      "ملاحظة المراجعة مطلوبة عند طلب الإعادة",
    );
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
