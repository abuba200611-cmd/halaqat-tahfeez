import "server-only";

import { db } from "./db";
import {
  applyPayment,
  canWaive,
  centsToDecimal,
  computeTotals,
  decimalToCents,
  isFeeStatus,
  isValidPeriodLabel,
  receiptNumber,
  type FeePeriod,
  type FeeStatus,
  type FeeTotals,
  type PaymentMethod,
} from "./fees";

/*
  الرسوم والاشتراكات — الوصول للبيانات. كل دالة مقيّدة بنطاق المستدعي: دوال
  الإدارة تأخذ mosqueId من مسار الجامع (الذي مرّ ببوابة الصلاحية) وتُضمّنه في
  كل WHERE — فلا يصل معرّف مستحق/خطة/حلقة من جامع آخر أبداً (لا IDOR)؛
  ودوال ولي الأمر/المعلّم تأخذ (حلقة، طالب) بعد أن تحقق المسار من الربط/الحلقة.
  المبالغ NUMERIC في القاعدة وهللات صحيحة هنا.
*/

export type FeePlan = {
  id: number;
  mosqueId: number;
  name: string;
  amountCents: number;
  period: FeePeriod;
  active: boolean;
  createdAt: string;
};

function rowToPlan(r: Record<string, unknown>): FeePlan {
  return {
    id: Number(r.id),
    mosqueId: Number(r.mosque_id),
    name: r.name as string,
    amountCents: decimalToCents(r.amount),
    period: r.period as FeePeriod,
    active: r.active === true,
    createdAt: String(r.created_at),
  };
}

export async function listPlans(mosqueId: number): Promise<FeePlan[]> {
  const rows = await db().sql`
    SELECT id, mosque_id, name, amount, period, active, created_at
    FROM fee_plans WHERE mosque_id = ${mosqueId} ORDER BY active DESC, id DESC
  `;
  return rows.map(rowToPlan);
}

export async function getPlan(mosqueId: number, planId: number): Promise<FeePlan | null> {
  const rows = await db().sql`
    SELECT id, mosque_id, name, amount, period, active, created_at
    FROM fee_plans WHERE id = ${planId} AND mosque_id = ${mosqueId}
  `;
  return rows[0] ? rowToPlan(rows[0]) : null;
}

export async function createPlan(
  mosqueId: number,
  input: { name: string; amountCents: number; period: FeePeriod },
): Promise<FeePlan> {
  const rows = await db().sql`
    INSERT INTO fee_plans (mosque_id, name, amount, period)
    VALUES (${mosqueId}, ${input.name}, ${centsToDecimal(input.amountCents)}::numeric, ${input.period})
    RETURNING id, mosque_id, name, amount, period, active, created_at
  `;
  return rowToPlan(rows[0]);
}

/** تعديل خطة (اسم/مبلغ/تفعيل). تغيير المبلغ لا يمسّ المستحقات المولَّدة سابقاً (لقطة وقت التوليد). */
export async function updatePlan(
  mosqueId: number,
  planId: number,
  patch: { name?: string; amountCents?: number; active?: boolean },
): Promise<FeePlan | null> {
  const rows = await db().sql`
    UPDATE fee_plans SET
      name   = COALESCE(${patch.name ?? null}, name),
      amount = COALESCE(${patch.amountCents === undefined ? null : centsToDecimal(patch.amountCents)}::numeric, amount),
      active = COALESCE(${patch.active ?? null}::boolean, active)
    WHERE id = ${planId} AND mosque_id = ${mosqueId}
    RETURNING id, mosque_id, name, amount, period, active, created_at
  `;
  return rows[0] ? rowToPlan(rows[0]) : null;
}

// ————— التوليد —————

export type GenerateResult =
  | { ok: true; eligible: number; created: number; skipped: number }
  | { ok: false; status: number; error: string };

/**
 * يولّد مستحقات خطة لفترة عبر الحلقات المختارة. متكرر التشغيل: التفرّد
 * (plan, halaqah, student, period) في القاعدة مع ON CONFLICT DO NOTHING، فيُنشأ
 * فقط ما لم يكن موجوداً. الحلقات لازم تكون من هذا الجامع، والطلاب فعّالون
 * وغير محذوفين. لقطة المبلغ تؤخذ من الخطة وقت التوليد.
 */
export async function generateDues(input: {
  mosqueId: number;
  planId: number;
  periodLabel: string;
  halaqahIds: number[];
  dueDate: string | null;
}): Promise<GenerateResult> {
  const plan = await getPlan(input.mosqueId, input.planId);
  if (!plan) return { ok: false, status: 404, error: "الخطة غير موجودة" };
  if (!plan.active) return { ok: false, status: 400, error: "الخطة معطّلة" };
  if (!isValidPeriodLabel(plan.period, input.periodLabel)) {
    return { ok: false, status: 400, error: "صيغة الفترة لا تطابق دورية الخطة" };
  }

  const owned = await db().sql`
    SELECT id FROM halaqahs WHERE mosque_id = ${input.mosqueId} AND id = ANY(${input.halaqahIds})
  `;
  if (owned.length !== input.halaqahIds.length) {
    return { ok: false, status: 404, error: "إحدى الحلقات ليست من هذا الجامع" };
  }

  const eligibleRows = await db().sql`
    SELECT count(*)::int AS n FROM students s
    WHERE s.teacher_id = ANY(${input.halaqahIds}) AND s.deleted_at IS NULL AND s.active = TRUE
  `;
  const eligible = Number(eligibleRows[0]?.n ?? 0);

  const status: FeeStatus = plan.amountCents === 0 ? "paid" : "due";
  const inserted = await db().sql`
    INSERT INTO student_fees (mosque_id, halaqah_id, student_id, plan_id, period_label, amount_due, status, due_date)
    SELECT ${input.mosqueId}, s.teacher_id, s.id, ${plan.id}, ${input.periodLabel},
           ${centsToDecimal(plan.amountCents)}::numeric, ${status}, ${input.dueDate}::date
    FROM students s
    WHERE s.teacher_id = ANY(${input.halaqahIds}) AND s.deleted_at IS NULL AND s.active = TRUE
    ON CONFLICT (plan_id, halaqah_id, student_id, period_label) DO NOTHING
    RETURNING id
  `;
  const created = inserted.length;
  return { ok: true, eligible, created, skipped: Math.max(0, eligible - created) };
}

// ————— القراءة —————

export type FeeRow = {
  id: number;
  mosqueId: number;
  halaqahId: number;
  halaqahName: string;
  studentId: string;
  studentName: string;
  planId: number;
  planName: string;
  periodLabel: string;
  amountDueCents: number;
  amountPaidCents: number;
  status: FeeStatus;
  dueDate: string | null;
  notes: string;
};

// ملاحظة: نص SELECT هذا مكرّر عمداً في ٣ استعلامات — قوالب sql لا تقبل ضمّ نص ثابت كمعامل.

function rowToFee(r: Record<string, unknown>): FeeRow {
  return {
    id: Number(r.id),
    mosqueId: Number(r.mosque_id),
    halaqahId: Number(r.halaqah_id),
    halaqahName: (r.halaqah_name as string) ?? "",
    studentId: r.student_id as string,
    studentName: (r.student_name as string) ?? "",
    planId: Number(r.plan_id),
    planName: (r.plan_name as string) ?? "",
    periodLabel: r.period_label as string,
    amountDueCents: decimalToCents(r.amount_due),
    amountPaidCents: decimalToCents(r.amount_paid),
    status: r.status as FeeStatus,
    dueDate: (r.due_date as string | null) ?? null,
    notes: (r.notes as string) ?? "",
  };
}

export type FeeFilters = { halaqahId?: number | null; status?: string | null; period?: string | null };

const LIST_LIMIT = 3000;

/** مستحقات الجامع بمرشّحات اختيارية (حلقة، حالة، فترة) + إجمالياتها. */
export async function listFees(mosqueId: number, filters: FeeFilters): Promise<{ fees: FeeRow[]; totals: FeeTotals }> {
  const halaqahId = filters.halaqahId ?? null;
  const status = filters.status && isFeeStatus(filters.status) ? filters.status : null;
  const period = filters.period?.trim() ? filters.period.trim().slice(0, 20) : null;
  const rows = await db().sql`
    SELECT f.id, f.mosque_id, f.halaqah_id, h.name AS halaqah_name, f.student_id, s.name AS student_name,
           f.plan_id, p.name AS plan_name, f.period_label, f.amount_due, f.amount_paid, f.status,
           to_char(f.due_date, 'YYYY-MM-DD') AS due_date, f.notes
    FROM student_fees f
    JOIN fee_plans p ON p.id = f.plan_id
    JOIN halaqahs h ON h.id = f.halaqah_id
    JOIN students s ON s.teacher_id = f.halaqah_id AND s.id = f.student_id
    WHERE f.mosque_id = ${mosqueId}
      AND (${halaqahId}::int IS NULL OR f.halaqah_id = ${halaqahId})
      AND (${status}::text IS NULL OR f.status = ${status})
      AND (${period}::text IS NULL OR f.period_label = ${period})
    ORDER BY f.period_label DESC, h.name, s.name, f.id
    LIMIT ${LIST_LIMIT}
  `;
  const fees = rows.map(rowToFee);
  return { fees, totals: computeTotals(fees) };
}

/** مستحق واحد داخل نطاق الجامع، أو null */
export async function getFeeForMosque(mosqueId: number, feeId: number): Promise<FeeRow | null> {
  const rows = await db().sql`
    SELECT f.id, f.mosque_id, f.halaqah_id, h.name AS halaqah_name, f.student_id, s.name AS student_name,
           f.plan_id, p.name AS plan_name, f.period_label, f.amount_due, f.amount_paid, f.status,
           to_char(f.due_date, 'YYYY-MM-DD') AS due_date, f.notes
    FROM student_fees f
    JOIN fee_plans p ON p.id = f.plan_id
    JOIN halaqahs h ON h.id = f.halaqah_id
    JOIN students s ON s.teacher_id = f.halaqah_id AND s.id = f.student_id
    WHERE f.id = ${feeId} AND f.mosque_id = ${mosqueId}
  `;
  return rows[0] ? rowToFee(rows[0]) : null;
}

export type PaymentRow = {
  id: number;
  studentFeeId: number;
  amountCents: number;
  paidAt: string;
  method: PaymentMethod;
  receiptNo: string;
  recordedByKind: string;
  note: string;
};

function rowToPayment(r: Record<string, unknown>): PaymentRow {
  return {
    id: Number(r.id),
    studentFeeId: Number(r.student_fee_id),
    amountCents: decimalToCents(r.amount),
    paidAt: new Date(r.paid_at as string).toISOString(),
    method: r.method as PaymentMethod,
    receiptNo: (r.receipt_no as string | null) ?? "",
    recordedByKind: (r.recorded_by_kind as string) ?? "",
    note: (r.note as string) ?? "",
  };
}

export async function listPaymentsForFee(feeId: number): Promise<PaymentRow[]> {
  const rows = await db().sql`
    SELECT id, student_fee_id, amount, paid_at, method, receipt_no, recorded_by_kind, note
    FROM fee_payments WHERE student_fee_id = ${feeId} ORDER BY paid_at, id
  `;
  return rows.map(rowToPayment);
}

// ————— الدفع والإعفاء —————

export type PaymentResult =
  | { ok: true; fee: FeeRow; payment: PaymentRow }
  | { ok: false; status: number; error: string };

/**
 * يسجّل دفعة ويحدّث amount_paid/status بترانزاكشن واحدة. القفل FOR UPDATE على
 * صف المستحق يمنع سباق دفعتين متزامنتين من تجاوز المتبقي. المستحق يُجلب بمعرّفه
 * وmosque_id معاً — معرّف جامع آخر = 404.
 */
export async function recordPayment(input: {
  mosqueId: number;
  feeId: number;
  amountCents: number;
  method: PaymentMethod;
  note: string;
  actor: { kind: "mosque_admin" | "developer"; id: number | null };
}): Promise<PaymentResult> {
  const client = await db().pool.connect();
  let paymentId = 0;
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT amount_due, amount_paid, status FROM student_fees WHERE id = $1 AND mosque_id = $2 FOR UPDATE`,
      [input.feeId, input.mosqueId],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, status: 404, error: "المستحق غير موجود" };
    }

    const outcome = applyPayment(
      {
        amountDueCents: decimalToCents(row.amount_due),
        amountPaidCents: decimalToCents(row.amount_paid),
        status: row.status as FeeStatus,
      },
      input.amountCents,
    );
    if (!outcome.ok) {
      await client.query("ROLLBACK");
      return { ok: false, status: 400, error: outcome.error };
    }

    const inserted = await client.query(
      `INSERT INTO fee_payments (student_fee_id, amount, method, recorded_by_kind, recorded_by_id, note)
       VALUES ($1, $2::numeric, $3, $4, $5, $6) RETURNING id, paid_at`,
      [input.feeId, centsToDecimal(input.amountCents), input.method, input.actor.kind, input.actor.id, input.note],
    );
    paymentId = Number(inserted.rows[0].id);
    const paidAtISO = new Date(inserted.rows[0].paid_at).toISOString();
    await client.query(`UPDATE fee_payments SET receipt_no = $1 WHERE id = $2`, [
      receiptNumber(paymentId, paidAtISO),
      paymentId,
    ]);
    await client.query(
      `UPDATE student_fees SET amount_paid = $1::numeric, status = $2, updated_at = now()
       WHERE id = $3 AND mosque_id = $4`,
      [centsToDecimal(outcome.amountPaidCents), outcome.status, input.feeId, input.mosqueId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const [fee, payments] = await Promise.all([getFeeForMosque(input.mosqueId, input.feeId), listPaymentsForFee(input.feeId)]);
  const payment = payments.find((p) => p.id === paymentId);
  if (!fee || !payment) return { ok: false, status: 500, error: "تعذّر قراءة الدفعة بعد حفظها" };
  return { ok: true, fee, payment };
}

export type WaiveResult = { ok: true; fee: FeeRow } | { ok: false; status: number; error: string };

/** إعفاء مستحق (مستحق أو جزئي فقط). الشرط الذرّي على الحالة يمنع سباقاً مع دفعة متزامنة. */
export async function waiveFee(mosqueId: number, feeId: number): Promise<WaiveResult> {
  const existing = await getFeeForMosque(mosqueId, feeId);
  if (!existing) return { ok: false, status: 404, error: "المستحق غير موجود" };
  if (!canWaive(existing.status)) {
    return { ok: false, status: 400, error: existing.status === "waived" ? "المستحق معفى مسبقاً" : "لا يُعفى مستحق مسدّد" };
  }
  const updated = await db().sql`
    UPDATE student_fees SET status = 'waived', updated_at = now()
    WHERE id = ${feeId} AND mosque_id = ${mosqueId} AND status IN ('due', 'partial')
    RETURNING id
  `;
  if (updated.length === 0) return { ok: false, status: 409, error: "تغيّرت حالة المستحق، أعد المحاولة" };
  const fee = await getFeeForMosque(mosqueId, feeId);
  return fee ? { ok: true, fee } : { ok: false, status: 404, error: "المستحق غير موجود" };
}

// ————— ولي الأمر والمعلّم (بعد أن تحقق المسار من الربط/الحلقة) —————

export async function getMosqueIdForHalaqah(halaqahId: number): Promise<number | null> {
  const rows = await db().sql`SELECT mosque_id FROM halaqahs WHERE id = ${halaqahId}`;
  const mosqueId = rows[0]?.mosque_id;
  return typeof mosqueId === "number" ? mosqueId : null;
}

export type ChildFee = FeeRow & { payments: PaymentRow[] };

/** رسوم طالب واحد مع دفعاتها — لولي أمره (قراءة فقط). النطاق: (حلقة، طالب) بعد التحقق من الربط. */
export async function listFeesForStudent(halaqahId: number, studentId: string): Promise<ChildFee[]> {
  const rows = await db().sql`
    SELECT f.id, f.mosque_id, f.halaqah_id, h.name AS halaqah_name, f.student_id, s.name AS student_name,
           f.plan_id, p.name AS plan_name, f.period_label, f.amount_due, f.amount_paid, f.status,
           to_char(f.due_date, 'YYYY-MM-DD') AS due_date, f.notes
    FROM student_fees f
    JOIN fee_plans p ON p.id = f.plan_id
    JOIN halaqahs h ON h.id = f.halaqah_id
    JOIN students s ON s.teacher_id = f.halaqah_id AND s.id = f.student_id
    WHERE f.halaqah_id = ${halaqahId} AND f.student_id = ${studentId}
    ORDER BY f.period_label DESC, f.id DESC
  `;
  const fees = rows.map(rowToFee);
  if (fees.length === 0) return [];
  const paymentRows = await db().sql`
    SELECT id, student_fee_id, amount, paid_at, method, receipt_no, recorded_by_kind, note
    FROM fee_payments WHERE student_fee_id = ANY(${fees.map((f) => f.id)}) ORDER BY paid_at, id
  `;
  const payments = paymentRows.map(rowToPayment);
  return fees.map((fee) => ({ ...fee, payments: payments.filter((p) => p.studentFeeId === fee.id) }));
}

export type TeacherFeeStatus = { status: FeeStatus; periodLabel: string };

/**
 * حالة آخر فترة مولَّدة لكل طالب بحلقة المعلّم (الحالة فقط، بلا مبالغ).
 * الفترة الأحدث لكل طالب = أكبر period_label (الصيغ مرتّبة معجمياً).
 */
export async function latestFeeStatusByStudent(halaqahId: number): Promise<Record<string, TeacherFeeStatus>> {
  const rows = await db().sql`
    SELECT DISTINCT ON (student_id) student_id, status, period_label
    FROM student_fees WHERE halaqah_id = ${halaqahId}
    ORDER BY student_id, period_label DESC, id DESC
  `;
  return Object.fromEntries(
    rows.map((r) => [r.student_id as string, { status: r.status as FeeStatus, periodLabel: r.period_label as string }]),
  );
}
