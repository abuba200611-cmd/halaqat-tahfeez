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

const { createWardLog, updateWardLog, listHalaqahMates, listPendingBuddyRequestsForStudent, respondToBuddyRequest } =
  await import("./db");

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

    expect(result).toBe(false);
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

    expect(result).toBe(true);
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

  it("تعديل الزميل (أو حتى نفس الزميل): يحذف صفّ الزميل القديم ثم يُدرج صفّاً جديداً بحالة pending — إعادة فعلية للحالة", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClient(1);
    connectMock.mockResolvedValue(client);

    await updateWardLog(2, "student-1", 17, buddySampleLog("buddy-2"));

    const texts = client.calls.map((c) => c.text.trim());
    const deleteIdx = texts.findIndex((t) => t.startsWith("DELETE FROM ward_review_buddies"));
    const insertIdx = texts.findIndex((t) => t.startsWith("INSERT INTO ward_review_buddies"));
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(insertIdx).toBeGreaterThan(deleteIdx);
    expect(texts[insertIdx]).toContain("'pending'");
  });

  it("إزالة الزميل (buddyStudentId=null) من ورد له زميل سابقاً: يحذف فقط، بلا إدراج جديد", async () => {
    mockBuddyValidation(true);
    const client = makeFakeClient(1);
    connectMock.mockResolvedValue(client);

    await updateWardLog(2, "student-1", 17, buddySampleLog(null));

    const texts = client.calls.map((c) => c.text.trim());
    expect(texts.some((t) => t.startsWith("DELETE FROM ward_review_buddies"))).toBe(true);
    expect(texts.some((t) => t.startsWith("INSERT INTO ward_review_buddies"))).toBe(false);
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
