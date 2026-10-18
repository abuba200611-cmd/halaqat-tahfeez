import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  صندوق الصادر (B1) بمحاكاة @netlify/database (نفس نمط lib/db.test.ts) —
  نتحكّم بجواب كل استعلام ونتحقق من النص والمعاملات، فنثبت القواعد دون
  قاعدة بيانات حقيقية: الميزة المعطّلة لا تُنشئ صفاً واحداً، التكرار الآمن
  بref، السقوف من إعدادات الجامع، الموافقة شرط الاستهداف، والحالات
  queued/sent/failed/skipped كما يجب.
*/

const sqlMock = vi.fn();
const targetsMock = vi.fn();
const featureMock = vi.fn();
const settingMock = vi.fn();
const optedInMock = vi.fn();

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ pool: { connect: vi.fn() }, sql: sqlMock }),
}));
vi.mock("../parent-db", () => ({
  listWhatsappParentsForStudent: targetsMock,
  isPhoneWhatsappOptedIn: optedInMock,
}));
vi.mock("../mosque/db", () => ({ isFeatureEnabled: featureMock }));
vi.mock("../mosque-settings-db", () => ({ getMosqueSetting: settingMock }));

const { dispatchWhatsapp, resendWhatsappOutbox, sendWhatsappToParentsOfStudent } = await import("./outbox");

/** نص الاستعلامات حتى الآن وكل معاملاتها — (sql وسم قالب: [strings, ...values]) */
function calls() {
  return sqlMock.mock.calls.map((call) => ({
    text: (call[0] as string[]).join("?"),
    values: call.slice(1),
  }));
}

const target = { parentId: 42, phone: "966501234567", studentName: "أحمد" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.WHATSAPP_TOKEN;
  delete process.env.WHATSAPP_PHONE_ID;
  vi.unstubAllGlobals();
  sqlMock.mockImplementation(async () => []);
  featureMock.mockResolvedValue(true);
  targetsMock.mockResolvedValue([target]);
  settingMock.mockResolvedValue(undefined); // الافتراضيات: 300 و5
  optedInMock.mockResolvedValue(true);
});

describe("sendWhatsappToParentsOfStudent — البوابة والاستهداف", () => {
  it("الميزة معطّلة بالجامع: لا استعلام صادر إطلاقاً (لا صفوف)", async () => {
    featureMock.mockResolvedValue(false);
    await sendWhatsappToParentsOfStudent({
      halaqahId: 3,
      studentId: "s1",
      mosqueId: 7,
      template: "ward_approved",
      paramsFor: (name) => ({ student_name: name }),
      refPrefix: "ward:12:approved",
    });
    expect(sqlMock).not.toHaveBeenCalled();
    expect(targetsMock).not.toHaveBeenCalled(); // لا استهداف أصلاً
  });

  it("لا متفقين (whatsapp_opt_in شرط الاستهداف): لا صفوف صادر", async () => {
    targetsMock.mockResolvedValue([]);
    await sendWhatsappToParentsOfStudent({
      halaqahId: 3,
      studentId: "s1",
      mosqueId: 7,
      template: "ward_approved",
      paramsFor: (name) => ({ student_name: name }),
      refPrefix: "ward:12:approved",
    });
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("موافق واحد: إدراج بمفتاح تكرار (اسم القالب:الحدث:المعرف) ثم تحديث الحالة", async () => {
    sqlMock
      .mockResolvedValueOnce([{ id: 5, status: "queued", error: "" }]) // الإدراج
      .mockResolvedValueOnce([]); // تحديث الحالة
    await sendWhatsappToParentsOfStudent({
      halaqahId: 3,
      studentId: "s1",
      mosqueId: 7,
      template: "ward_approved",
      paramsFor: (name) => ({ student_name: name }),
      refPrefix: "ward:12:approved",
    });

    const insert = calls()[0];
    expect(insert.text).toContain("INSERT INTO notifications_outbox");
    expect(insert.values).toContain("halaqa_ward_approved:ward:12:approved:42");
    expect(insert.values).toContain("ward_approved");
    // المزوّد غير مهيأ (لا مفاتيح): التحديث يسجّل skipped بالسبب
    const update = calls()[1];
    expect(update.text).toContain("UPDATE notifications_outbox");
    expect(update.values).toContain("skipped");
    expect(update.values).toContain("provider_not_configured");
  });
});

describe("dispatchWhatsapp — الصندوق والحالات", () => {
  it("الإرسال بمزوّد مهيأ: queued ثم sent", async () => {
    process.env.WHATSAPP_TOKEN = "token";
    process.env.WHATSAPP_PHONE_ID = "phone1";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    sqlMock
      .mockResolvedValueOnce([{ id: 5, status: "queued", error: "" }])
      .mockResolvedValueOnce([]);

    const result = await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "0501234567",
      template: "ward_approved",
      params: { student_name: "أحمد" },
      ref: "halaqa_ward_approved:ward:1:approved:42",
    });

    expect(result.sent).toBe(true);
    // الرقم يُطبَّع E.164 قبل الإرسال — هذا ما يستلمه المزوّد
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).to).toBe("966501234567");
    expect(calls()[1].values).toContain("sent");
  });

  it("تكرار ref (الحدث نفسه أُرسل قبل قليل): deduped ولا مزوّد ولا تحديث", async () => {
    sqlMock.mockResolvedValueOnce([]); // الإدراج رجع صفر صفوف (WHERE NOT EXISTS)

    const result = await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "966501234567",
      template: "ward_approved",
      params: {},
      ref: "halaqa_ward_approved:ward:1:approved:42",
    });

    expect(result.deduped).toBe(true);
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("سباق إدراجين لنفس ref (فهرس فريد 23505): deduped لا خطأ", async () => {
    sqlMock.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));

    const result = await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "966501234567",
      template: "ward_approved",
      params: {},
      ref: "x",
    });
    expect(result.deduped).toBe(true);
  });

  it("القاعدة قررت skipped (سقف الجامع): السبب يمرّ كما هو ولا مزوّد", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 9, status: "skipped", error: "cap_mosque" }]);

    const result = await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "966501234567",
      template: "ward_approved",
      params: {},
      ref: "x",
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("cap_mosque");
    expect(sqlMock).toHaveBeenCalledTimes(1);
  });

  it("رقم غير صالح: علم invalid_phone يُمرَّر للقاعدة داخل الجملة نفسها", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 10, status: "skipped", error: "invalid_phone" }]);

    const result = await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "not-a-phone",
      template: "ward_approved",
      params: {},
      ref: "x",
    });
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe("invalid_phone");
    expect(calls()[0].values).toContain(true); // معامل ${invalid}::boolean
  });

  it("السقوف من إعدادات الجامع (mosque_settings) تُمرَّر للجملة لا الافتراضيات", async () => {
    settingMock.mockResolvedValue({ dailyMosqueCap: 2, dailyRecipientCap: 1 });
    sqlMock.mockResolvedValueOnce([{ id: 5, status: "queued", error: "" }]).mockResolvedValueOnce([]);

    await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "966501234567",
      template: "ward_approved",
      params: {},
      ref: "x",
    });

    const values = calls()[0].values;
    expect(values).toContain(2);
    expect(values).toContain(1);
    expect(values).not.toContain(300);
  });

  it("عدّ السقف يستثني المتخطاة ويقفل على اليوم: هذا داخل نص الجملة نفسها", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 5, status: "queued", error: "" }]).mockResolvedValueOnce([]);
    await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "966501234567",
      template: "ward_approved",
      params: {},
      ref: "x",
    });
    const text = calls()[0].text;
    expect(text).toContain("status != 'skipped'");
    expect(text).toContain("date_trunc('day', now() AT TIME ZONE 'Asia/Riyadh')");
  });

  it("فشل المزوّد: الحالة failed مع رسالة الخطأ", async () => {
    process.env.WHATSAPP_TOKEN = "token";
    process.env.WHATSAPP_PHONE_ID = "phone1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: "template not found" } }), { status: 400 })),
    );
    sqlMock
      .mockResolvedValueOnce([{ id: 5, status: "queued", error: "" }])
      .mockResolvedValueOnce([]);

    const result = await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "966501234567",
      template: "ward_approved",
      params: {},
      ref: "x",
    });
    expect(result.failed).toBe(true);
    expect(result.reason).toBe("template not found");
    expect(calls()[1].values).toContain("failed");
  });

  it("قاعدة البيانات معطّلة عن الإدراج: db_error ولا رمي", async () => {
    sqlMock.mockRejectedValueOnce(new Error("connection refused"));
    const result = await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "966501234567",
      template: "ward_approved",
      params: {},
      ref: "x",
    });
    expect(result.failed).toBe(true);
    expect(result.reason).toBe("db_error");
  });
});

describe("السقف اليومي — يوم الرياض", () => {
  it("عدّ اليوم بتوقيت Asia/Riyadh لا UTC", async () => {
    sqlMock.mockResolvedValueOnce([{ id: 1, status: "queued", error: "" }]);
    await dispatchWhatsapp({
      mosqueId: 7,
      toPhone: "966501234567",
      template: "ward_approved",
      params: { student_name: "أحمد" },
      ref: "r1",
    });
    expect(calls()[0]?.text).toContain("AT TIME ZONE 'Asia/Riyadh'");
  });
});

describe("resendWhatsappOutbox — ذرّية وإعادة تحقق", () => {
  const claimedRow = { id: 9, to_phone: "966501234567", template: "ward_approved", params: { student_name: "أ" }, mosque_id: 7 };

  it("الحجز بتحديث شرطي (failed أو queued عالق 10 دقائق) مع RETURNING", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await resendWhatsappOutbox(9);
    const text = calls()[0]?.text ?? "";
    expect(text).toContain("UPDATE notifications_outbox");
    expect(text).toContain("status = 'failed'");
    expect(text).toContain("interval '10 minutes'");
    expect(text).toContain("RETURNING");
  });

  it("لم يُحجز والصف موجود (نقرة متزامنة خسرت): not_failed ولا إرسال", async () => {
    sqlMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ "?column?": 1 }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await resendWhatsappOutbox(9)).toBe("not_failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("لا صف أصلاً: not_found", async () => {
    sqlMock.mockResolvedValue([]);
    expect(await resendWhatsappOutbox(9)).toBe("not_found");
  });

  it("الولي لم يعد موافقاً: skipped بسبب ولا استدعاء مزوّد", async () => {
    sqlMock.mockResolvedValueOnce([claimedRow]).mockResolvedValue([]);
    optedInMock.mockResolvedValue(false);
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_ID = "p";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await resendWhatsappOutbox(9)).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(calls()[1]?.values).toContain("recipient_not_opted_in");
  });

  it("الميزة معطّلة بالجامع: skipped بسبب feature_disabled", async () => {
    sqlMock.mockResolvedValueOnce([claimedRow]).mockResolvedValue([]);
    featureMock.mockResolvedValue(false);
    expect(await resendWhatsappOutbox(9)).toBe("skipped");
    expect(featureMock).toHaveBeenCalledWith(7, "whatsapp");
    expect(calls()[1]?.values).toContain("feature_disabled");
  });

  it("كل الشروط سليمة والمزوّد غير مهيأ: skipped provider_not_configured", async () => {
    sqlMock.mockResolvedValueOnce([claimedRow]).mockResolvedValue([]);
    expect(await resendWhatsappOutbox(9)).toBe("skipped");
    expect(calls()[1]?.values).toContain("provider_not_configured");
  });
});
