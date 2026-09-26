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

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    pool: { connect: connectMock },
    sql: vi.fn(),
  }),
}));

const { updateWardLog } = await import("./db");

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
