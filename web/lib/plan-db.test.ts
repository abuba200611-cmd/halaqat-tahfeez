import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.hoisted(() => ({ calls: [] as { text: string; values: unknown[] }[], next: [] as unknown[][] }));
vi.mock("./db", () => ({
  db: () => ({
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlMock.calls.push({ text: strings.join("?"), values });
      return Promise.resolve(sqlMock.next.shift() ?? []);
    },
  }),
}));

const { copyPreviousPlans, getMonthActuals, upsertPlan } = await import("./plan-db");

describe("plan-db (STEP 63)", () => {
  beforeEach(() => {
    sqlMock.calls = [];
    sqlMock.next = [];
  });

  it("copyPreviousPlans لا يستبدل خطة قائمة (DO NOTHING) ولا ينسخ لطالب محذوف أو غير فعّال", async () => {
    sqlMock.next = [[{ student_id: "a" }, { student_id: "b" }]];
    expect(await copyPreviousPlans(3, 7, "1448-03", "1448-04")).toBe(2);
    const { text, values } = sqlMock.calls[0];
    expect(text).toContain("ON CONFLICT (halaqah_id, student_id, month) DO NOTHING");
    expect(text).not.toContain("DO UPDATE");
    expect(text).toContain("s.active AND s.deleted_at IS NULL");
    expect(values).toContain(3);
    expect(values).toContain("1448-03");
    expect(values).toContain("1448-04");
  });

  it("upsertPlan: طالب من حلقة أخرى لا يُكتب (0 صفوف يعني false) والحلقة بشرط الاستعلام", async () => {
    sqlMock.next = [[]];
    const ok = await upsertPlan(3, 7, "x", "1448-04", { hifzPagesTarget: 1, reviewPagesTarget: 1, hifz: null, notes: null });
    expect(ok).toBe(false);
    expect(sqlMock.calls[0].text).toContain("s.teacher_id =");
    expect(sqlMock.calls[0].values).toContain(3);
  });

  it("upsertPlan ينجح حين يُدرَج الصف", async () => {
    sqlMock.next = [[{ student_id: "s1" }]];
    expect(
      await upsertPlan(3, 7, "s1", "1448-04", { hifzPagesTarget: 1, reviewPagesTarget: 1, hifz: null, notes: null }),
    ).toBe(true);
  });

  it("getMonthActuals يستبعد المرفوض بالاستعلام ويجمع النتيجة لكل طالب", async () => {
    sqlMock.next = [
      [
        { student_id: "a", hifz_from: 10, hifz_to: 12, review_pages: 4 },
        { student_id: "a", hifz_from: 11, hifz_to: 13, review_pages: 6 },
        { student_id: "b", hifz_from: null, hifz_to: null, review_pages: 0 },
      ],
    ];
    const out = await getMonthActuals(3, "2026-10-01", "2026-10-30");
    expect(sqlMock.calls[0].text).toContain("status <> 'needs_revision'");
    expect(sqlMock.calls[0].values).toEqual([3, "2026-10-01", "2026-10-30", null, null]);
    expect(out.a).toEqual({ hifzPages: 4, reviewPages: 10 });
    expect(out.b).toEqual({ hifzPages: 0, reviewPages: 0 });
  });
});
