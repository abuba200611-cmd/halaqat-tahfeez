import { afterEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => vi.fn());
vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ sql: sqlMock }),
}));

const { checkRateLimit } = await import("./rate-limit");

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
