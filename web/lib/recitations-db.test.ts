import { beforeEach, describe, expect, it, vi } from "vitest";

const queries: { text: string; params: unknown[] }[] = [];
const release = vi.fn();
let insertRows: { id: number }[] = [{ id: 11 }];

vi.mock("./db", () => ({
  db: () => ({
    pool: {
      connect: async () => ({
        query: async (text: string, params: unknown[] = []) => {
          queries.push({ text: text.trim(), params });
          if (text.includes("INSERT INTO recitations")) return { rows: insertRows };
          return { rows: [] };
        },
        release,
      }),
    },
  }),
}));

const { insertRecitation } = await import("./recitations-db");

const input = {
  halaqahId: 3,
  studentId: "s1",
  range: { surah: 67, fromAyah: 1, toAyah: 30 },
  mime: "audio/webm" as const,
  durationSec: 60,
  bytes: Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]),
};

describe("insertRecitation — الاحتفاظ بآخر ١٠ (STEP 64)", () => {
  beforeEach(() => {
    queries.length = 0;
    release.mockClear();
    insertRows = [{ id: 11 }];
  });

  it("يُدرج ثم يقصّ الأقدم بحدّ 10 داخل ترانزاكشن واحد ويرجع المعرّف", async () => {
    expect(await insertRecitation(input)).toBe(11);

    const texts = queries.map((q) => q.text);
    expect(texts[0]).toBe("BEGIN");
    expect(texts[1]).toContain("INSERT INTO recitations");
    expect(texts[2]).toContain("DELETE FROM recitations");
    expect(texts[2]).toContain("ORDER BY created_at DESC, id DESC");
    expect(texts[3]).toBe("COMMIT");

    // حدّ الاحتفاظ = 10 ومقيَّد بحلقة الطالب ومعرّفه فقط
    expect(queries[2].params).toEqual([3, "s1", 10]);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("يخزّن حجم البايتات الفعلي لا قيمة من العميل", async () => {
    await insertRecitation(input);
    const params = queries[1].params;
    expect(params[6]).toBe(input.bytes.length);
    expect(params[8]).toBe(input.bytes);
  });

  it("طالب غير موجود/موقوف: ROLLBACK ولا قصّ، ويرجع null", async () => {
    insertRows = [];
    expect(await insertRecitation(input)).toBeNull();
    const texts = queries.map((q) => q.text);
    expect(texts).toEqual([expect.stringContaining("BEGIN"), expect.stringContaining("INSERT"), "ROLLBACK"]);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
