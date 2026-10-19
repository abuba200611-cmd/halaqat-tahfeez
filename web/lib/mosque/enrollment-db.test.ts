import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  طبقة بيانات التوزيع الآلي: نحاكي @netlify/database (sql + pool) ونلتقط الاستعلامات.
  نثبت: اختيار الحلقة الأقل طلاباً ثم الانتظار عند الامتلاء، قفل صف الجامع قبل أي كتابة،
  ترقية أول منتظر مطابق عند شغور مقعد (وتعطّلها بتعطّل الميزة)، تقييد كل شيء بجامع المسار،
  وفرض استيراد المعلّم على حلقته وحدها مع تراجع كامل عند الفشل.
*/

type Call = { text: string; params: unknown[] };
const clientCalls: Call[] = [];
const state = vi.hoisted(() => ({
  featureEnabled: true,
  registration: null as Record<string, unknown> | null,
  slots: [] as Record<string, unknown>[],
  waiting: [] as Record<string, unknown>[],
  people: [] as Record<string, unknown>[],
  criteriaRows: [{ id: 3 }] as Record<string, unknown>[],
  removeRows: [{ name: "منتظر" }] as Record<string, unknown>[],
  failOnProfileInsert: false,
  connects: 0,
}));

const norm = (text: string) => text.replace(/\s+/g, " ").trim();

vi.mock("@/lib/identity", () => ({ ensureStudentIdentity: async () => {} }));

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    sql: async (strings: TemplateStringsArray) => {
      const text = norm(strings.join("?"));
      if (text.includes("FROM mosque_features")) return [{ enabled: state.featureEnabled }];
      if (text.includes("SELECT mosque_id FROM halaqahs")) return [{ mosque_id: 5 }];
      return [];
    },
    pool: {
      connect: async () => {
        state.connects += 1;
        return {
          query: async (rawText: string, params: unknown[] = []) => {
            const text = norm(rawText);
            clientCalls.push({ text, params });
            if (text.startsWith("SELECT id, name, birth_year, level FROM mosque_registrations")) {
              return { rows: state.registration ? [state.registration] : [] };
            }
            if (text.includes("FROM halaqahs h WHERE h.mosque_id = $1")) return { rows: state.slots };
            if (text.includes("COALESCE(MAX(waitlist_order), 0) + 1")) return { rows: [{ next: 4 }] };
            if (text.startsWith("SELECT id FROM mosque_registrations WHERE mosque_id = $1 AND status = 'waitlisted'")) {
              return { rows: [{ id: 1 }, { id: 2 }, { id: 9 }] };
            }
            if (text.startsWith("SELECT id, name, birth_year, level, waitlist_order FROM mosque_registrations")) {
              return { rows: state.waiting };
            }
            if (text.includes("status = 'removed'")) return { rows: state.removeRows };
            if (text.startsWith("UPDATE halaqahs SET capacity")) return { rows: state.criteriaRows };
            if (text.includes("FROM students s JOIN halaqahs h")) return { rows: state.people };
            if (text.startsWith("INSERT INTO student_profiles") && state.failOnProfileInsert) throw new Error("boom");
            if (text.startsWith("INSERT INTO mosque_registrations")) return { rows: [{ id: 77 }] };
            return { rows: [] };
          },
          release: () => {},
        };
      },
    },
  }),
}));

const {
  autoAssignRegistration,
  commitImport,
  moveWaitlistEntry,
  onSeatFreed,
  removeWaitlistEntry,
  updateHalaqahCriteria,
} = await import("./enrollment-db");

const slotRow = (id: number, count: number, over: Record<string, unknown> = {}) => ({
  id,
  name: `حلقة ${id}`,
  capacity: null,
  min_age: null,
  max_age: null,
  level: null,
  cnt: count,
  ...over,
});
const stmts = () => clientCalls.map((c) => c.text.split(" ")[0]);
const find = (prefix: string) => clientCalls.filter((c) => c.text.startsWith(prefix));

beforeEach(() => {
  clientCalls.length = 0;
  state.featureEnabled = true;
  state.registration = { id: 40, name: "سالم", birth_year: null, level: null };
  state.slots = [];
  state.waiting = [];
  state.people = [];
  state.criteriaRows = [{ id: 3 }];
  state.removeRows = [{ name: "منتظر" }];
  state.failOnProfileInsert = false;
  state.connects = 0;
});

describe("التوزيع الآلي للتسجيل الجديد", () => {
  it("يقفل صف الجامع أولاً ويختار الأقل طلاباً ثم يربط التسجيل بالطالب الجديد", async () => {
    state.slots = [slotRow(2, 9, { capacity: 30 }), slotRow(1, 3, { capacity: 30 }), slotRow(3, 3, { capacity: 30 })];
    const outcome = await autoAssignRegistration(5, 40);

    expect(outcome).toMatchObject({ kind: "assigned", halaqahId: 1 }); // تعادل ١ و٣ ← الأصغر معرّفاً
    expect(stmts().slice(0, 2)).toEqual(["BEGIN", "SELECT"]);
    expect(clientCalls[1].text).toContain("FROM mosques WHERE id = $1 FOR UPDATE");
    expect(clientCalls[1].params).toEqual([5]);
    expect(stmts().at(-1)).toBe("COMMIT");

    const insert = find("INSERT INTO students")[0];
    expect(insert.params[1]).toBe(1); // teacher_id = معرّف الحلقة المختارة
    const update = find("UPDATE mosque_registrations")[0];
    expect(update.text).toContain("status = 'assigned'");
    expect(update.params[0]).toBe(1);
    expect(update.params).toContain(5); // مقيّد بجامع المسار
    expect(find("INSERT INTO enrollment_activity")[0].params[1]).toBe("auto_assigned");
  });

  it("الحلقات ممتلئة ← قائمة الانتظار بالدور التالي وسجل نشاط", async () => {
    state.slots = [slotRow(1, 10, { capacity: 10 }), slotRow(2, 4, { capacity: 4 })];
    const outcome = await autoAssignRegistration(5, 40);

    expect(outcome).toMatchObject({ kind: "waitlisted" });
    expect(find("INSERT INTO students")).toHaveLength(0);
    const update = find("UPDATE mosque_registrations")[0];
    expect(update.text).toContain("status = 'waitlisted'");
    expect(update.params[0]).toBe(4); // MAX+1
    expect(find("INSERT INTO enrollment_activity")[0].params[1]).toBe("waitlisted");
  });

  it("معيار عمر لحلقة وحيدة والمسجِّل بلا سنة ميلاد ← انتظار (لا تخمين)", async () => {
    state.slots = [slotRow(1, 0, { min_age: 8 })];
    expect(await autoAssignRegistration(5, 40)).toMatchObject({ kind: "waitlisted" });
  });

  it("الميزة معطّلة ← لا اتصال ولا كتابة", async () => {
    state.featureEnabled = false;
    expect(await autoAssignRegistration(5, 40)).toBeNull();
    expect(state.connects).toBe(0);
  });

  it("تسجيل غير معلّق (وُزّع/لا يخص الجامع) ← null بلا أي كتابة", async () => {
    state.registration = null;
    state.slots = [slotRow(1, 0)];
    expect(await autoAssignRegistration(5, 40)).toBeNull();
    expect(find("INSERT")).toHaveLength(0);
    expect(find("UPDATE")).toHaveLength(0);
  });

  it("جامع بلا حلقات ← يبقى معلّقاً للتوزيع اليدوي", async () => {
    state.slots = [];
    expect(await autoAssignRegistration(5, 40)).toBeNull();
    expect(find("UPDATE")).toHaveLength(0);
  });
});

describe("الترقية عند شغور مقعد", () => {
  it("يرقّي أول منتظر مطابق بالترتيب فقط، بقدر المقاعد الشاغرة (مقعد واحد)", async () => {
    state.slots = [slotRow(3, 4, { capacity: 5, level: "beginner" })];
    state.waiting = [
      { id: 10, name: "متقدم", birth_year: null, level: "advanced", waitlist_order: 1 },
      { id: 11, name: "مبتدئ أول", birth_year: null, level: "beginner", waitlist_order: 2 },
      { id: 12, name: "مبتدئ ثان", birth_year: null, level: "beginner", waitlist_order: 3 },
    ];
    const promoted = await onSeatFreed(3);

    expect(promoted).toBe(1);
    const updates = find("UPDATE mosque_registrations");
    expect(updates).toHaveLength(1);
    expect(updates[0].params).toContain(11);
    expect(updates[0].params[0]).toBe(3);
    expect(find("INSERT INTO students")[0].params[1]).toBe(3);
    const activity = find("INSERT INTO enrollment_activity")[0];
    expect(activity.params[1]).toBe("promoted");
    expect(String(activity.params[4])).toContain("مبتدئ أول");
  });

  it("المقعد ما زال ممتلئاً ← لا ترقية", async () => {
    state.slots = [slotRow(3, 5, { capacity: 5 })];
    state.waiting = [{ id: 10, name: "أ", birth_year: null, level: null, waitlist_order: 1 }];
    expect(await onSeatFreed(3)).toBe(0);
    expect(find("UPDATE mosque_registrations")).toHaveLength(0);
  });

  it("الميزة معطّلة ← لا شيء", async () => {
    state.featureEnabled = false;
    expect(await onSeatFreed(3)).toBe(0);
    expect(state.connects).toBe(0);
  });

  it("رفع السعة يرقّي المنتظرين في الترانزاكشن نفسها", async () => {
    state.slots = [slotRow(3, 5, { capacity: 7 })];
    state.waiting = [
      { id: 10, name: "أ", birth_year: null, level: null, waitlist_order: 1 },
      { id: 11, name: "ب", birth_year: null, level: null, waitlist_order: 2 },
      { id: 12, name: "ج", birth_year: null, level: null, waitlist_order: 3 },
    ];
    const result = await updateHalaqahCriteria(5, 3, { capacity: 7, minAge: null, maxAge: null, level: null });
    expect(result).toEqual({ promoted: 2 });
    expect(find("UPDATE halaqahs")[0].params).toEqual([7, null, null, null, 3, 5]); // الحلقة + الجامع معاً
    expect(stmts().at(-1)).toBe("COMMIT");
  });

  it("حلقة ليست من هذا الجامع ← null بلا ترقية", async () => {
    state.criteriaRows = [];
    const result = await updateHalaqahCriteria(5, 999, { capacity: 7, minAge: null, maxAge: null, level: null });
    expect(result).toBeNull();
    expect(find("INSERT INTO students")).toHaveLength(0);
  });
});

describe("إدارة قائمة الانتظار", () => {
  it("التحريك يعيد ترقيم الكل بالترتيب الجديد ومقيّداً بالجامع", async () => {
    expect(await moveWaitlistEntry(5, 2, "up")).toBe("moved");
    const renumber = find("UPDATE mosque_registrations SET waitlist_order");
    expect(renumber.map((c) => [c.params[0], c.params[1], c.params[2]])).toEqual([
      [1, 2, 5],
      [2, 1, 5],
      [3, 9, 5],
    ]);
  });
  it("معرّف غائب عن القائمة ← not_found، وعند الحافة ← edge", async () => {
    expect(await moveWaitlistEntry(5, 777, "up")).toBe("not_found");
    clientCalls.length = 0;
    expect(await moveWaitlistEntry(5, 1, "up")).toBe("edge");
    expect(find("UPDATE")).toHaveLength(0);
  });
  it("الإزالة حذف ناعم مقيّد بالجامع، وتسجّل نشاطاً", async () => {
    expect(await removeWaitlistEntry(5, 12)).toBe(true);
    const update = find("UPDATE mosque_registrations")[0];
    expect(update.text).toContain("status = 'removed'");
    expect(update.text).toContain("status = 'waitlisted'");
    expect(update.params).toEqual([12, 5]);
    expect(find("INSERT INTO enrollment_activity")[0].params[1]).toBe("removed");
  });
  it("تسجيل ليس بالانتظار أو من جامع آخر ← false بلا نشاط", async () => {
    state.removeRows = [];
    expect(await removeWaitlistEntry(5, 12)).toBe(false);
    expect(find("INSERT INTO enrollment_activity")).toHaveLength(0);
  });
});

describe("استيراد المعلّم", () => {
  const teacherRows = [
    { line: 2, name: "أحمد", phone: "0501234567", parentPhone: "", birthYear: "2014", halaqah: "حلقة الجامع الثانية", notes: "ن" },
    { line: 3, name: "موجود", phone: "0507777777", parentPhone: "", birthYear: "", halaqah: "", notes: "" },
    { line: 4, name: "", phone: "", parentPhone: "", birthYear: "", halaqah: "", notes: "" },
  ];

  beforeEach(() => {
    state.slots = [slotRow(1, 0, { name: "حلقتي" }), slotRow(2, 0, { name: "حلقة الجامع الثانية" })];
    state.people = [{ name: "موجود", phone: "0507777777" }];
  });

  it("يدرج بحلقة المعلّم فقط حتى لو ذكر الملف حلقة أخرى، ويتخطّى المكرر والخاطئ", async () => {
    const result = await commitImport(5, { kind: "teacher", halaqahId: 1 }, teacherRows);

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.rows.map((r) => r.status)).toEqual(["ok", "duplicate", "error"]);

    const inserts = find("INSERT INTO students");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params[1]).toBe(1); // لا الحلقة ٢ المذكورة بالملف
    expect(find("INSERT INTO student_profiles")[0].params[0]).toBe(1);
    expect(find("INSERT INTO mosque_registrations")).toHaveLength(0);
    expect(stmts().at(-1)).toBe("COMMIT");
  });

  it("فشل أثناء الإدراج ← ROLLBACK وخطأ بلا COMMIT", async () => {
    state.failOnProfileInsert = true;
    await expect(commitImport(5, { kind: "teacher", halaqahId: 1 }, teacherRows)).rejects.toThrow("boom");
    expect(stmts()).toContain("ROLLBACK");
    expect(stmts()).not.toContain("COMMIT");
  });

  it("المدير: صف بلا حلقة يدخل قائمة التسجيلات ويوزَّع آلياً إن فُعّلت الميزة", async () => {
    state.registration = { id: 77, name: "علي", birth_year: null, level: null };
    state.people = [];
    const result = await commitImport(
      5,
      { kind: "admin" },
      [{ line: 2, name: "علي", phone: "", parentPhone: "", birthYear: "", halaqah: "", notes: "" }],
    );
    expect(result.created).toBe(1);
    expect(find("INSERT INTO mosque_registrations")[0].params[0]).toBe(5);
    expect(result.autoAssigned).toBe(1);
    expect(find("UPDATE mosque_registrations")[0].text).toContain("status = 'assigned'");
  });
});
