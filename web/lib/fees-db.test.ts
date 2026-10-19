import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  طبقة بيانات الرسوم: نحاكي @netlify/database (sql + pool) ونلتقط الاستعلامات.
  نثبت: ترانزاكشن الدفع (جزئي ثم مسدّد، رفض الزائد والمعفى مع ROLLBACK وبلا كتابة)،
  تقييد المستحق بجامع المسار (لا IDOR)، وتوليد المستحقات المتكرر بلا تكرار.
*/

type Call = { text: string; values: unknown[] };
const sqlCalls: Call[] = [];
const sqlResults: Record<string, unknown>[][] = [];
const clientCalls: { text: string; params: unknown[] }[] = [];
const clientRows = vi.hoisted(() => ({ select: [] as Record<string, unknown>[] }));
const released = vi.hoisted(() => ({ count: 0 }));

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      sqlCalls.push({ text: strings.join("?"), values });
      return sqlResults.length > 0 ? (sqlResults.shift() as Record<string, unknown>[]) : [];
    },
    pool: {
      connect: async () => ({
        query: async (text: string, params: unknown[] = []) => {
          clientCalls.push({ text, params });
          if (text.includes("FROM student_fees") && text.includes("FOR UPDATE")) return { rows: clientRows.select };
          if (text.includes("INSERT INTO fee_payments")) return { rows: [{ id: 41, paid_at: "2026-10-19T09:00:00.000Z" }] };
          return { rows: [] };
        },
        release: () => {
          released.count += 1;
        },
      }),
    },
  }),
}));

const { generateDues, recordPayment, waiveFee } = await import("./fees-db");

beforeEach(() => {
  sqlCalls.length = 0;
  sqlResults.length = 0;
  clientCalls.length = 0;
  clientRows.select = [];
  released.count = 0;
});

const feeSelectRow = (over: Record<string, unknown> = {}) => ({
  id: 7,
  mosque_id: 5,
  halaqah_id: 9,
  halaqah_name: "حلقة",
  student_id: "s1",
  student_name: "أحمد",
  plan_id: 2,
  plan_name: "شهري",
  period_label: "2026-10",
  amount_due: "100.00",
  amount_paid: "0.00",
  status: "due",
  due_date: null,
  notes: "",
  ...over,
});
const paymentRow = (over: Record<string, unknown> = {}) => ({
  id: 41,
  student_fee_id: 7,
  amount: "40.00",
  paid_at: "2026-10-19T09:00:00.000Z",
  method: "cash",
  receipt_no: "2026-000041",
  recorded_by_kind: "mosque_admin",
  note: "",
  ...over,
});

const actor = { kind: "mosque_admin" as const, id: 3 };
const pay = (amountCents: number, mosqueId = 5, feeId = 7) =>
  recordPayment({ mosqueId, feeId, amountCents, method: "cash", note: "", actor });
const stmts = () => clientCalls.map((c) => c.text.trim().split(/\s+/)[0]);

describe("recordPayment — ترانزاكشن واحدة", () => {
  it("دفعة جزئية: BEGIN ← قفل ← إدراج ← رقم الإيصال ← تحديث (partial) ← COMMIT", async () => {
    clientRows.select = [{ amount_due: "100.00", amount_paid: "0.00", status: "due" }];
    sqlResults.push([feeSelectRow({ amount_paid: "40.00", status: "partial" })], [paymentRow()]);

    const result = await pay(4000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fee.status).toBe("partial");
    expect(result.payment.receiptNo).toBe("2026-000041");

    expect(stmts()).toEqual(["BEGIN", "SELECT", "INSERT", "UPDATE", "UPDATE", "COMMIT"]);
    const update = clientCalls.find((c) => c.text.includes("UPDATE student_fees"));
    expect(update?.params).toEqual(["40.00", "partial", 7, 5]);
    const insert = clientCalls.find((c) => c.text.includes("INSERT INTO fee_payments"));
    expect(insert?.params[1]).toBe("40.00");
    expect(released.count).toBe(1);
  });

  it("استكمال المتبقي: تُحدَّث الحالة إلى paid بالمبلغ الكلي", async () => {
    clientRows.select = [{ amount_due: "100.00", amount_paid: "40.00", status: "partial" }];
    sqlResults.push([feeSelectRow({ amount_paid: "100.00", status: "paid" })], [paymentRow({ amount: "60.00" })]);

    const result = await pay(6000);
    expect(result.ok).toBe(true);
    const update = clientCalls.find((c) => c.text.includes("UPDATE student_fees"));
    expect(update?.params).toEqual(["100.00", "paid", 7, 5]);
  });

  it("دفعة أكبر من المتبقي: 400 مع ROLLBACK وبلا إدراج ولا تحديث", async () => {
    clientRows.select = [{ amount_due: "100.00", amount_paid: "90.00", status: "partial" }];
    const result = await pay(2000);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(stmts()).toEqual(["BEGIN", "SELECT", "ROLLBACK"]);
    expect(released.count).toBe(1);
  });

  it("معفى لا يقبل دفعات: 400 مع ROLLBACK", async () => {
    clientRows.select = [{ amount_due: "100.00", amount_paid: "0.00", status: "waived" }];
    const result = await pay(1000);
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(stmts()).toEqual(["BEGIN", "SELECT", "ROLLBACK"]);
  });

  it("مستحق جامع آخر: القفل بـ(المعرّف، جامع المسار) فيعود 404 بلا كتابة", async () => {
    clientRows.select = []; // قيد mosque_id لم يطابق
    const result = await pay(1000, 6, 7);
    expect(result).toMatchObject({ ok: false, status: 404 });
    const select = clientCalls.find((c) => c.text.includes("FOR UPDATE"));
    expect(select?.text).toContain("id = $1 AND mosque_id = $2");
    expect(select?.params).toEqual([7, 6]);
    expect(stmts()).toEqual(["BEGIN", "SELECT", "ROLLBACK"]);
  });
});

describe("waiveFee", () => {
  it("إعفاء مستحق: تحديث بشرط الحالة الذرّي وقيد الجامع", async () => {
    sqlResults.push([feeSelectRow()], [{ id: 7 }], [feeSelectRow({ status: "waived" })]);
    const result = await waiveFee(5, 7);
    expect(result).toMatchObject({ ok: true, fee: { status: "waived" } });
    const update = sqlCalls.find((c) => c.text.includes("UPDATE student_fees"));
    expect(update?.text).toContain("status IN ('due', 'partial')");
    expect(update?.values).toEqual([7, 5]);
  });

  it("مسدّد أو معفى أصلاً: 400 بلا تحديث", async () => {
    sqlResults.push([feeSelectRow({ status: "paid", amount_paid: "100.00" })]);
    expect(await waiveFee(5, 7)).toMatchObject({ ok: false, status: 400 });
    sqlResults.push([feeSelectRow({ status: "waived" })]);
    expect(await waiveFee(5, 7)).toMatchObject({ ok: false, status: 400 });
    expect(sqlCalls.some((c) => c.text.includes("UPDATE student_fees"))).toBe(false);
  });

  it("مستحق جامع آخر: 404", async () => {
    sqlResults.push([]);
    expect(await waiveFee(6, 7)).toMatchObject({ ok: false, status: 404 });
    expect(sqlCalls[0].values).toContain(6);
  });
});

describe("generateDues — متكرر التشغيل", () => {
  const plan = { id: 2, mosque_id: 5, name: "شهري", amount: "50.00", period: "monthly", active: true, created_at: "2026-10-01" };
  const input = { mosqueId: 5, planId: 2, periodLabel: "2026-10", halaqahIds: [9, 10], dueDate: null };

  it("التشغيل الأول ينشئ، والثاني بنفس الفترة لا ينشئ شيئاً (ON CONFLICT DO NOTHING)", async () => {
    // التشغيل الأول: ٣ مؤهلين وكلهم يُنشأون
    sqlResults.push([plan], [{ id: 9 }, { id: 10 }], [{ n: 3 }], [{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(await generateDues(input)).toEqual({ ok: true, eligible: 3, created: 3, skipped: 0 });

    // التشغيل الثاني: القاعدة ترجع صفر صفوف لأن المفتاح الفريد موجود
    sqlResults.push([plan], [{ id: 9 }, { id: 10 }], [{ n: 3 }], []);
    expect(await generateDues(input)).toEqual({ ok: true, eligible: 3, created: 0, skipped: 3 });

    const inserts = sqlCalls.filter((c) => c.text.includes("INSERT INTO student_fees"));
    expect(inserts).toHaveLength(2);
    for (const insert of inserts) {
      expect(insert.text).toContain("ON CONFLICT (plan_id, halaqah_id, student_id, period_label) DO NOTHING");
      expect(insert.text).toContain("s.deleted_at IS NULL AND s.active = TRUE");
    }
  });

  it("تشغيل جزئي: يتخطى الموجود وينشئ الجديد فقط", async () => {
    sqlResults.push([plan], [{ id: 9 }, { id: 10 }], [{ n: 5 }], [{ id: 8 }, { id: 9 }]);
    expect(await generateDues(input)).toEqual({ ok: true, eligible: 5, created: 2, skipped: 3 });
  });

  it("لقطة المبلغ من الخطة، والحالة paid لخطة بمبلغ صفر", async () => {
    sqlResults.push([{ ...plan, amount: "0.00" }], [{ id: 9 }, { id: 10 }], [{ n: 1 }], [{ id: 1 }]);
    await generateDues(input);
    const insert = sqlCalls.find((c) => c.text.includes("INSERT INTO student_fees"));
    expect(insert?.values).toContain("0.00");
    expect(insert?.values).toContain("paid");
  });

  it("حلقة من جامع آخر: 404 بلا أي إدراج", async () => {
    sqlResults.push([plan], [{ id: 9 }]); // حلقة واحدة فقط من الاثنتين تتبع الجامع
    expect(await generateDues(input)).toMatchObject({ ok: false, status: 404 });
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO student_fees"))).toBe(false);
    const owned = sqlCalls.find((c) => c.text.includes("FROM halaqahs"));
    expect(owned?.text).toContain("mosque_id =");
  });

  it("خطة جامع آخر / غير موجودة: 404؛ خطة معطّلة أو فترة لا تطابق الدورية: 400", async () => {
    sqlResults.push([]);
    expect(await generateDues(input)).toMatchObject({ ok: false, status: 404 });
    sqlResults.push([{ ...plan, active: false }]);
    expect(await generateDues(input)).toMatchObject({ ok: false, status: 400 });
    sqlResults.push([plan]);
    expect(await generateDues({ ...input, periodLabel: "2026" })).toMatchObject({ ok: false, status: 400 });
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO student_fees"))).toBe(false);
  });
});
