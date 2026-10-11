import { afterEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn());
vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ sql: sqlMock }),
}));

const { checkRateLimit, peekRateLimit, recordRateLimitHit } = await import("./rate-limit");

/** نص الاستعلام الأول المُنفَّذ (قالب الوسوم بلا قيم الاستيفاء) */
function firstSqlText(): string {
  const call = sqlMock.mock.calls[0] as unknown as [TemplateStringsArray];
  return call[0].join("");
}

describe("checkRateLimit — العدّاد الذرّي (الدفعة الأمنية ب)", () => {
  afterEach(() => {
    sqlMock.mockReset();
    vi.restoreAllMocks();
  });

  it("يسمح ما دام العدّاد ضمن الحدّ، ويمنع بعده", async () => {
    sqlMock.mockResolvedValueOnce([{ count: 5 }]);
    expect(await checkRateLimit("k", 5, 60)).toBe(true);

    sqlMock.mockResolvedValueOnce([{ count: 6 }]);
    expect(await checkRateLimit("k", 5, 60)).toBe(false);
  });

  it("استعلام واحد ذرّي: INSERT مع ON CONFLICT يزيد العدّاد ويرجعه", async () => {
    sqlMock.mockResolvedValueOnce([{ count: 1 }]);
    await checkRateLimit("ward:7:s1", 30, 3600);

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const text = firstSqlText();
    expect(text).toContain("INSERT INTO rate_limits");
    expect(text).toContain("ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1");
    expect(text).toContain("RETURNING count");
  });

  it("بداية النافذة محاذية لحدّ النافذة — نفس النافذة تقع بنفس المفتاح", async () => {
    sqlMock.mockResolvedValue([{ count: 1 }]);
    await checkRateLimit("k", 10, 900);
    const values = (sqlMock.mock.calls[0] as unknown as unknown[]).slice(1);
    const windowSeconds = values[1] as number;
    expect(windowSeconds % 900).toBe(0);
  });

  it("يفشل مفتوحاً عند خطأ قاعدة البيانات — لا يعطّل المستخدم الشرعي", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sqlMock.mockRejectedValueOnce(new Error("db down"));
    expect(await checkRateLimit("k", 5, 60)).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("peekRateLimit — فحص بلا احتساب (حدود «الفشل فقط» كحدّ الدخول لكل بريد)", () => {
  afterEach(() => {
    sqlMock.mockReset();
    vi.restoreAllMocks();
  });

  it("قراءة فقط: دون الحدّ يسمح، وعنده يمنع (١٠ محاولات فاشلة → المحاولة ١١ محجوبة)", async () => {
    sqlMock.mockResolvedValueOnce([{ count: 9 }]);
    expect(await peekRateLimit("login:email:u@x", 10, 900)).toBe(true);

    sqlMock.mockResolvedValueOnce([{ count: 10 }]);
    expect(await peekRateLimit("login:email:u@x", 10, 900)).toBe(false);
  });

  it("لا صفّ بعد (صفر محاولات فاشلة بالدلو الحالي): مسموح", async () => {
    sqlMock.mockResolvedValueOnce([]);
    expect(await peekRateLimit("login:email:u@x", 10, 900)).toBe(true);
  });

  it("SELECT خالص بلا أي كتابة، بنفس محاذاة نافذة checkRateLimit", async () => {
    sqlMock.mockResolvedValue([{ count: 1 }]);
    await peekRateLimit("login:email:u@x", 10, 900);

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const text = firstSqlText();
    expect(text).toContain("SELECT count FROM rate_limits");
    expect(text).not.toContain("INSERT");
    const values = (sqlMock.mock.calls[0] as unknown as unknown[]).slice(1);
    const windowSeconds = values[1] as number;
    expect(windowSeconds % 900).toBe(0);
  });

  it("يفشل مفتوحاً عند خطأ قاعدة البيانات — لا يُقفل أحداً بتعطّل العدّاد", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sqlMock.mockRejectedValueOnce(new Error("db down"));
    expect(await peekRateLimit("login:email:u@x", 10, 900)).toBe(true);
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("recordRateLimitHit — الاحتساب الذرّي عند الفشل فقط", () => {
  afterEach(() => {
    sqlMock.mockReset();
    vi.restoreAllMocks();
  });

  it("upsert واحد بلا RETURNING: نفس جملة checkRateLimit نفسها بالضبط", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await recordRateLimitHit("login:email:u@x", 900);

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const text = firstSqlText();
    expect(text).toContain("INSERT INTO rate_limits");
    expect(text).toContain("ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1");
    expect(text).not.toContain("RETURNING");
  });

  it("يفشل مفتوحاً (لا يرمي) عند خطأ قاعدة البيانات — فشل التسجيل لا يُفشل الدخول", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    sqlMock.mockRejectedValueOnce(new Error("db down"));
    await expect(recordRateLimitHit("login:email:u@x", 900)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
