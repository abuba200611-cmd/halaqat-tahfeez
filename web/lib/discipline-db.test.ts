import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  A2 — نحاكي @netlify/database ونلتقط نصّ SQL وقيمه، فنثبت: إدراج أحداث
  الغياب الآلية متكرر الآمن (ON CONFLICT DO NOTHING — لا تكرار مهما أعيد
  الحساب)، والإيقاف يُستعاد تلقائياً بانتهاء مدته، وكل كتابة محصورة
  بحلقة الجلسة (لا يقبل أي استعلام هنا معرّف حلقة إلا كوسيط مستدعٍ).
*/

type Call = { text: string; values: unknown[] };
const calls: Call[] = [];
const results: Record<string, unknown>[][] = [];

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ text: strings.join("?"), values });
      return results.length > 0 ? (results.shift() as Record<string, unknown>[]) : [];
    },
  }),
}));

const { runAbsenceLadder, recordViolation, restoreExpiredSuspensions, dismissStudent, getMonthlySheetData } =
  await import("./discipline-db");
const { DEFAULT_DISCIPLINE_CONFIG } = await import("./discipline");

beforeEach(() => {
  calls.length = 0;
  results.length = 0;
});

const absentDays = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    student_id: "s1",
    date: `2026-10-${String(15 - i).padStart(2, "0")}`,
    status: "absent",
  }));

describe("runAbsenceLadder — الإدراج المتكرر الآمن", () => {
  it("٣ غياب متتالية تدرج إنذاراً أول مرة واحدة (RETURNING يعيد صفاً)", async () => {
    results.push(absentDays(3), [{ id: 11 }]);
    const inserted = await runAbsenceLadder(7, "2026-10-15", DEFAULT_DISCIPLINE_CONFIG);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ studentId: "s1", kind: "absence_warning", level: 1, notifyParent: true });
    // قراءة الحضور محصورة بالحلقة، والإدراج مشروط بطلاب الحلقة أنفسهم
    expect(calls[0].text).toContain("FROM attendance");
    expect(calls[0].values).toContain(7);
    expect(calls[1].text).toContain("INSERT INTO discipline_events");
    expect(calls[1].text).toContain("ON CONFLICT DO NOTHING");
    expect(calls[1].text).toContain("WHERE s.teacher_id");
    expect(calls[1].values).toContain(7);
    expect(calls[1].values).toContain("s1");
  });

  it("إعادة الحساب نفسها لا تدرج شيئاً (الفهرس الفريد يبتلع التكرار)", async () => {
    results.push(absentDays(3), []);
    const inserted = await runAbsenceLadder(7, "2026-10-15", DEFAULT_DISCIPLINE_CONFIG);
    expect(inserted).toHaveLength(0); // RETURNING فارغ = لم يُدرج الآن — لا إشعار
  });

  it("٧ غيابات متتالية: استدعاء + تنبيه إدارة، وكلٌّ مستقل بإدراجه", async () => {
    results.push(absentDays(7), [{ id: 21 }], [{ id: 22 }]);
    const inserted = await runAbsenceLadder(7, "2026-10-15", DEFAULT_DISCIPLINE_CONFIG);
    expect(inserted.map((e) => e.kind).sort()).toEqual(["admin_alert", "parent_summons"]);
  });

  it("لا أحداث دون بلوغ أي عتبة", async () => {
    results.push(absentDays(2));
    const inserted = await runAbsenceLadder(7, "2026-10-15", DEFAULT_DISCIPLINE_CONFIG);
    expect(inserted).toHaveLength(0);
    expect(calls).toHaveLength(1); // قراءة واحدة فقط — لا محاولة إدراج أصلاً
  });
});

describe("recordViolation — سُلّم المخالفات والإيقاف", () => {
  it("المخالفة الخامسة = درجة إيقاف: الحدث + تعطيل الطالب + سجل إيقاف حتى now+N", async () => {
    results.push(
      [{ n: 4 }], // المخالفات السابقة
      [{ id: 31 }], // إدراج الحدث
      [{ until: "2026-10-18T00:00:00.000Z" }], // إدراج الإيقاف
    );
    const result = await recordViolation({
      halaqahId: 7,
      studentId: "s1",
      category: "إخلال بالسلوك",
      note: "مكررة",
      createdBy: 55,
      config: DEFAULT_DISCIPLINE_CONFIG,
    });

    expect(result).toEqual({
      found: true,
      step: 5,
      eventId: 31,
      suspensionUntil: "2026-10-18T00:00:00.000Z",
    });
    const eventInsert = calls[1];
    expect(eventInsert.text).toContain("'violation'");
    expect(eventInsert.values).toEqual(expect.arrayContaining([7, "s1", 5, "إخلال بالسلوك — مكررة", 55]));
    const suspension = calls[2];
    expect(suspension.text).toContain("UPDATE students SET active = false");
    expect(suspension.text).toContain("student_suspensions");
    expect(suspension.text).toContain("ON CONFLICT DO NOTHING");
    expect(suspension.values).toContain(DEFAULT_DISCIPLINE_CONFIG.violations.suspensionDays);
  });

  it("طالب من حلقة أخرى: الإدراج المشروط لا يجد صفاً = found:false بلا إيقاف", async () => {
    results.push([{ n: 0 }], []); // لا صف مُدرج
    const result = await recordViolation({
      halaqahId: 7,
      studentId: "foreign",
      category: "أخرى",
      note: null,
      createdBy: 55,
      config: DEFAULT_DISCIPLINE_CONFIG,
    });
    expect(result.found).toBe(false);
    expect(result.suspensionUntil).toBeNull();
    expect(calls).toHaveLength(2); // لا استعلام إيقاف أصلاً
    expect(calls[1].values).toContain(7); // الحصر بحلقة الجلسة
  });
});

describe("restoreExpiredSuspensions — الاسترجاع التلقائي", () => {
  it("يعلّم المنتهي restored_at ويعيد الطلاب لحالتهم السابقة (لا cron)", async () => {
    results.push([{ due: 2, restored: 2 }]);
    const result = await restoreExpiredSuspensions({ mosqueId: 3 });
    expect(result).toEqual({ due: 2, restored: 2 });
    expect(calls[0].text).toContain("SET restored_at = now()");
    expect(calls[0].text).toContain("SET active = d.prev_active");
    expect(calls[0].text).toContain("ss.until <= now()");
    expect(calls[0].text).toContain("h.mosque_id");
    expect(calls[0].values).toContain(3);
  });

  it("النطاق حلقة: الشرط يحمل معرّفها", async () => {
    results.push([{ due: 0, restored: 0 }]);
    await restoreExpiredSuspensions({ halaqahId: 9 });
    expect(calls[0].values).toContain(9);
  });
});

describe("dismissStudent — الفصل النهائي", () => {
  it("محصور بحلقات الجامع ويُبطِل الطالب بلا استرجاع", async () => {
    results.push([{ written: 1 }]);
    const result = await dismissStudent({ mosqueId: 3, halaqahId: 7, studentId: "s1", committeeNote: "قرار اللجنة بعد الاستدعاءات" });
    expect(result.found).toBe(true);
    expect(calls[0].text).toContain("mosque_id =");
    expect(calls[0].text).toContain("'dismissal'");
    expect(calls[0].text).toContain("UPDATE students SET active = false");
    expect(calls[0].values).toEqual(expect.arrayContaining([3, 7, "s1", "قرار اللجنة بعد الاستدعاءات"]));
  });

  it("حلقة من جامع آخر (أو طالب مجهول): لا كتابة", async () => {
    results.push([{ written: 0 }]);
    const result = await dismissStudent({ mosqueId: 3, halaqahId: 99, studentId: "s1", committeeNote: "ملاحظة لجنة" });
    expect(result.found).toBe(false);
  });
});

describe("getMonthlySheetData — حرس to_regclass للاختبارات", () => {
  it("جدول exams غير موجود: العمود يسقط كلياً (examsPassed = null) ولا يفشل الكشف", async () => {
    results.push(
      [{ id: "s1", name: "أحمد", active: true }], // الطلاب
      [{ student_id: "s1", date: "1448-04-05", status: "present" }], // الحضور
      [], // أوراد (getMonthActuals)
      [], // الخطط (listHalaqahPlans)
      [{ student_id: "s1", n: 2 }], // أحداث الانضباط
      [{ exams_exists: false }], // to_regclass
      [], // حالة الكشف
    );
    const sheet = await getMonthlySheetData(7, "1448-04", DEFAULT_DISCIPLINE_CONFIG);
    expect(sheet.examsAvailable).toBe(false);
    expect(sheet.students).toHaveLength(1);
    expect(sheet.students[0].examsPassed).toBeNull();
    expect(sheet.students[0].disciplineEvents).toBe(2);
    expect(sheet.students[0].attendance.present).toBe(1);
    expect(sheet.status).toBe("draft");
  });
});
