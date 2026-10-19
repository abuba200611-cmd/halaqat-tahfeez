/*
  الرسوم والاشتراكات — منطق نقي (بلا قاعدة بيانات ولا React) يُختبر مباشرة.
  سجل يدوي فقط: لا بوابة دفع. كل حساب مالي بالهللات (أعداد صحيحة) — لا floats
  إطلاقاً؛ والقاعدة NUMERIC(10,2) وتُحوَّل نصّاً <-> هللات هنا.
*/

export const FEES_FEATURE_KEY = "fees";

/** وسم العملة في الواجهات — ثابت واحد سهل التعديل */
export const CURRENCY_LABEL = "ر.س";

/** أكبر مبلغ يتسع له NUMERIC(10,2) */
export const MAX_AMOUNT_CENTS = 9_999_999_999;

export type FeePeriod = "monthly" | "term" | "yearly" | "once";
export type FeeStatus = "due" | "partial" | "paid" | "waived";
export type PaymentMethod = "cash" | "transfer" | "other";

export const FEE_PERIODS: readonly FeePeriod[] = ["monthly", "term", "yearly", "once"];
export const FEE_STATUSES: readonly FeeStatus[] = ["due", "partial", "paid", "waived"];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "transfer", "other"];

export const PERIOD_LABELS: Record<FeePeriod, string> = {
  monthly: "شهري",
  term: "فصلي",
  yearly: "سنوي",
  once: "مرة واحدة",
};

export const STATUS_LABELS: Record<FeeStatus, string> = {
  due: "مستحق",
  partial: "مدفوع جزئياً",
  paid: "مدفوع",
  waived: "معفى",
};

export const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "نقداً",
  transfer: "تحويل",
  other: "أخرى",
};

export function isFeePeriod(value: unknown): value is FeePeriod {
  return typeof value === "string" && (FEE_PERIODS as readonly string[]).includes(value);
}
export function isFeeStatus(value: unknown): value is FeeStatus {
  return typeof value === "string" && (FEE_STATUSES as readonly string[]).includes(value);
}
export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

// ————— المال بالهللات —————

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/**
 * نص/رقم مبلغ → هللات صحيحة، أو null إن لم يكن مبلغاً صالحاً (منزلتان عشريتان
 * كحد أقصى، غير سالب). لا يمرّ عبر float: التحليل نصّي بالكامل.
 */
export function parseMoneyToCents(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  const normalized = String(value)
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace("٫", ".");
  const match = /^(\d{1,8})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0") || "0");
  return cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/** هللات → نص عشري بمنزلتين ("1250" ← "12.50") — صالح للإدراج بعمود NUMERIC */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** قيمة NUMERIC كما تعيدها القاعدة (نص "12.50" أو رقم) → هللات */
export function decimalToCents(value: unknown): number {
  const parsed = parseMoneyToCents(typeof value === "string" || typeof value === "number" ? value : "0");
  return parsed ?? 0;
}

/** للعرض: "12.50 ر.س" */
export function formatMoney(cents: number): string {
  return `${centsToDecimal(cents)} ${CURRENCY_LABEL}`;
}

// ————— الدفع —————

export type FeeState = { amountDueCents: number; amountPaidCents: number; status: FeeStatus };

export type PaymentOutcome =
  | { ok: true; amountPaidCents: number; status: FeeStatus }
  | { ok: false; code: "invalid_amount" | "waived" | "already_paid" | "overpayment"; error: string };

/** حالة المستحق من المبلغ والمدفوع (غير معفى) */
export function deriveStatus(amountDueCents: number, amountPaidCents: number): FeeStatus {
  if (amountPaidCents >= amountDueCents) return "paid";
  return amountPaidCents > 0 ? "partial" : "due";
}

/**
 * أثر دفعة على مستحق: الإعفاء لا يقبل دفعات، المسدّد بالكامل لا يقبل، والدفع
 * الزائد عن المتبقي مرفوض (لا رصيد دائن). الجزئي ← partial، والكامل ← paid.
 */
export function applyPayment(fee: FeeState, paymentCents: number): PaymentOutcome {
  if (!Number.isInteger(paymentCents) || paymentCents <= 0) {
    return { ok: false, code: "invalid_amount", error: "مبلغ الدفعة غير صالح" };
  }
  if (fee.status === "waived") {
    return { ok: false, code: "waived", error: "هذا المستحق معفى — لا يقبل دفعات" };
  }
  if (fee.status === "paid" || fee.amountPaidCents >= fee.amountDueCents) {
    return { ok: false, code: "already_paid", error: "هذا المستحق مسدّد بالكامل" };
  }
  const newPaid = fee.amountPaidCents + paymentCents;
  if (newPaid > fee.amountDueCents) {
    return {
      ok: false,
      code: "overpayment",
      error: `الدفعة أكبر من المتبقي (${centsToDecimal(fee.amountDueCents - fee.amountPaidCents)})`,
    };
  }
  return { ok: true, amountPaidCents: newPaid, status: deriveStatus(fee.amountDueCents, newPaid) };
}

/** الإعفاء ممكن من مستحق أو جزئي فقط */
export function canWaive(status: FeeStatus): boolean {
  return status === "due" || status === "partial";
}

// ————— تسمية الفترات —————

/** هل الوسم صالح لدورية الخطة؟ شهري YYYY-MM، فصلي YYYY-T1..T3، سنوي YYYY، مرة واحدة once */
export function isValidPeriodLabel(period: FeePeriod, label: string): boolean {
  switch (period) {
    case "monthly":
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(label);
    case "term":
      return /^\d{4}-T[1-3]$/.test(label);
    case "yearly":
      return /^\d{4}$/.test(label);
    case "once":
      return label === "once";
  }
}

/** وسم الفترة الحالية لتاريخ ISO (YYYY-MM-DD) ودورية الخطة — للمقترح الافتراضي في الواجهة */
export function defaultPeriodLabel(period: FeePeriod, todayISO: string): string {
  const year = todayISO.slice(0, 4);
  switch (period) {
    case "monthly":
      return todayISO.slice(0, 7);
    case "term": {
      const month = Number(todayISO.slice(5, 7));
      return `${year}-T${month <= 4 ? 1 : month <= 8 ? 2 : 3}`;
    }
    case "yearly":
      return year;
    case "once":
      return "once";
  }
}

// ————— مدخلات المسارات —————

export type PlanInput = { name: string; amountCents: number; period: FeePeriod };

export function parsePlanBody(body: unknown, partial = false): { ok: true; value: Partial<PlanInput> & { active?: boolean } } | { ok: false; error: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const value: Partial<PlanInput> & { active?: boolean } = {};

  if (raw.name !== undefined || !partial) {
    const name = String(raw.name ?? "").trim().slice(0, 80);
    if (!name) return { ok: false, error: "اسم الخطة مطلوب" };
    value.name = name;
  }
  if (raw.amount !== undefined || !partial) {
    const cents = parseMoneyToCents(raw.amount);
    if (cents === null) return { ok: false, error: "المبلغ غير صالح" };
    value.amountCents = cents;
  }
  if (raw.period !== undefined || !partial) {
    if (!isFeePeriod(raw.period)) return { ok: false, error: "الدورية غير صالحة" };
    value.period = raw.period;
  }
  if (raw.active !== undefined) {
    if (typeof raw.active !== "boolean") return { ok: false, error: "قيمة التفعيل غير صالحة" };
    value.active = raw.active;
  }
  return { ok: true, value };
}

export type GenerateInput = { planId: number; periodLabel: string; halaqahIds: number[]; dueDate: string | null };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseGenerateBody(body: unknown): { ok: true; value: GenerateInput } | { ok: false; error: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const planId = Number(raw.planId);
  if (!Number.isSafeInteger(planId) || planId <= 0) return { ok: false, error: "اختر خطة" };

  const periodLabel = String(raw.periodLabel ?? "").trim();
  if (!periodLabel || periodLabel.length > 20) return { ok: false, error: "الفترة مطلوبة" };

  if (!Array.isArray(raw.halaqahIds) || raw.halaqahIds.length === 0 || raw.halaqahIds.length > 500) {
    return { ok: false, error: "اختر حلقة واحدة على الأقل" };
  }
  const halaqahIds: number[] = [];
  for (const entry of raw.halaqahIds) {
    const id = Number(entry);
    if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, error: "حلقة غير صالحة" };
    if (!halaqahIds.includes(id)) halaqahIds.push(id);
  }

  let dueDate: string | null = null;
  if (raw.dueDate !== undefined && raw.dueDate !== null && raw.dueDate !== "") {
    const candidate = String(raw.dueDate);
    if (!ISO_DATE.test(candidate) || Number.isNaN(Date.parse(`${candidate}T00:00:00Z`))) {
      return { ok: false, error: "تاريخ الاستحقاق غير صالح" };
    }
    dueDate = candidate;
  }
  return { ok: true, value: { planId, periodLabel, halaqahIds, dueDate } };
}

export type PaymentInput = { amountCents: number; method: PaymentMethod; note: string };

export function parsePaymentBody(body: unknown): { ok: true; value: PaymentInput } | { ok: false; error: string } {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const amountCents = parseMoneyToCents(raw.amount);
  if (amountCents === null || amountCents <= 0) return { ok: false, error: "مبلغ الدفعة غير صالح" };
  const method = raw.method === undefined ? "cash" : raw.method;
  if (!isPaymentMethod(method)) return { ok: false, error: "طريقة الدفع غير صالحة" };
  return { ok: true, value: { amountCents, method, note: String(raw.note ?? "").trim().slice(0, 300) } };
}

// ————— الإجماليات —————

export type TotalsRow = { status: FeeStatus; amountDueCents: number; amountPaidCents: number };

export type FeeTotals = { dueCents: number; collectedCents: number; outstandingCents: number };

/** المستحق (دون المعفى) والمحصَّل والمتبقي (على المستحق/الجزئي فقط) */
export function computeTotals(rows: readonly TotalsRow[]): FeeTotals {
  let dueCents = 0;
  let collectedCents = 0;
  let outstandingCents = 0;
  for (const row of rows) {
    collectedCents += row.amountPaidCents;
    if (row.status === "waived") continue;
    dueCents += row.amountDueCents;
    outstandingCents += Math.max(0, row.amountDueCents - row.amountPaidCents);
  }
  return { dueCents, collectedCents, outstandingCents };
}

// ————— CSV —————

export type CsvFeeRow = {
  studentName: string;
  halaqahName: string;
  planName: string;
  periodLabel: string;
  amountDueCents: number;
  amountPaidCents: number;
  status: FeeStatus;
  dueDate: string | null;
};

/**
 * خلية CSV: تنصيص عند الفاصلة/السطر/التنصيص، ومنع حقن الصيغ في Excel
 * (خلية نصية تبدأ بـ = + - @ تُسبق بفاصلة عليا).
 */
export function csvCell(value: string | number): string {
  let str = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function buildFeesCsv(rows: readonly CsvFeeRow[]): string {
  const header = ["الطالب", "الحلقة", "الخطة", "الفترة", "المستحق", "المدفوع", "المتبقي", "الحالة", "تاريخ الاستحقاق"];
  const lines = rows.map((row) => {
    const remaining = row.status === "waived" ? 0 : Math.max(0, row.amountDueCents - row.amountPaidCents);
    return [
      csvCell(row.studentName),
      csvCell(row.halaqahName),
      csvCell(row.planName),
      csvCell(row.periodLabel),
      csvCell(centsToDecimal(row.amountDueCents)),
      csvCell(centsToDecimal(row.amountPaidCents)),
      csvCell(centsToDecimal(remaining)),
      csvCell(STATUS_LABELS[row.status]),
      csvCell(row.dueDate ?? ""),
    ].join(",");
  });
  // BOM ليفتح Excel العربية صحيحة
  return "﻿" + [header.map(csvCell).join(","), ...lines].join("\r\n");
}

/** رقم الإيصال من معرّف الدفعة والسنة: 2026-000123 */
export function receiptNumber(paymentId: number, paidAtISO: string): string {
  return `${paidAtISO.slice(0, 4)}-${String(paymentId).padStart(6, "0")}`;
}
