import { describe, expect, it } from "vitest";
import {
  applyPayment,
  buildFeesCsv,
  canWaive,
  centsToDecimal,
  computeTotals,
  csvCell,
  decimalToCents,
  defaultPeriodLabel,
  deriveStatus,
  formatMoney,
  isValidPeriodLabel,
  parseGenerateBody,
  parseMoneyToCents,
  parsePaymentBody,
  parsePlanBody,
  receiptNumber,
} from "./fees";

describe("المال بالهللات (بلا floats)", () => {
  it("يحلّل نصوصاً عشرية بدقة", () => {
    expect(parseMoneyToCents("12.5")).toBe(1250);
    expect(parseMoneyToCents("12.50")).toBe(1250);
    expect(parseMoneyToCents("0.07")).toBe(7);
    expect(parseMoneyToCents("100")).toBe(10000);
    expect(parseMoneyToCents(0.1)).toBe(10);
    expect(parseMoneyToCents("١٢٫٥٠")).toBe(1250);
  });

  it("يرفض غير الصالح: سالب، أكثر من منزلتين، نص، فارغ، أكبر من NUMERIC(10,2)", () => {
    for (const bad of ["-1", "1.234", "abc", "", "1e3", "12,50", null, undefined, NaN, {}, "100000000.00"]) {
      expect(parseMoneyToCents(bad)).toBeNull();
    }
    expect(parseMoneyToCents("99999999.99")).toBe(9_999_999_999);
  });

  it("0.1 + 0.2 لا يسبب كسوراً: الجمع بالهللات", () => {
    const total = (parseMoneyToCents("0.1") as number) + (parseMoneyToCents("0.2") as number);
    expect(centsToDecimal(total)).toBe("0.30");
  });

  it("تنسيق وتحويل عكسي", () => {
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(123456)).toBe("1234.56");
    expect(decimalToCents("1234.56")).toBe(123456);
    expect(decimalToCents("50.00")).toBe(5000);
    expect(formatMoney(1250)).toBe("12.50 ر.س");
  });
});

describe("applyPayment — حساب الدفع", () => {
  const fee = (over = {}) => ({ amountDueCents: 10000, amountPaidCents: 0, status: "due" as const, ...over });

  it("دفعة جزئية ← partial", () => {
    expect(applyPayment(fee(), 4000)).toEqual({ ok: true, amountPaidCents: 4000, status: "partial" });
  });

  it("جزئي ثم استكمال المتبقي ← paid", () => {
    const first = applyPayment(fee(), 4000);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = applyPayment(fee({ amountPaidCents: first.amountPaidCents, status: first.status }), 6000);
    expect(second).toEqual({ ok: true, amountPaidCents: 10000, status: "paid" });
  });

  it("دفع كامل دفعة واحدة ← paid", () => {
    expect(applyPayment(fee(), 10000)).toEqual({ ok: true, amountPaidCents: 10000, status: "paid" });
  });

  it("دفعة أكبر من المتبقي مرفوضة (لا رصيد دائن)", () => {
    const over = applyPayment(fee(), 10001);
    expect(over).toMatchObject({ ok: false, code: "overpayment" });
    const overPartial = applyPayment(fee({ amountPaidCents: 9000, status: "partial" }), 1001);
    expect(overPartial).toMatchObject({ ok: false, code: "overpayment" });
  });

  it("المعفى لا يقبل دفعات", () => {
    expect(applyPayment(fee({ status: "waived" }), 100)).toMatchObject({ ok: false, code: "waived" });
  });

  it("المسدّد بالكامل لا يقبل دفعة إضافية", () => {
    expect(applyPayment(fee({ amountPaidCents: 10000, status: "paid" }), 100)).toMatchObject({
      ok: false,
      code: "already_paid",
    });
  });

  it("مبلغ صفر/سالب/كسري مرفوض", () => {
    for (const bad of [0, -5, 1.5, NaN]) {
      expect(applyPayment(fee(), bad)).toMatchObject({ ok: false, code: "invalid_amount" });
    }
  });

  it("deriveStatus وcanWaive", () => {
    expect(deriveStatus(100, 0)).toBe("due");
    expect(deriveStatus(100, 1)).toBe("partial");
    expect(deriveStatus(100, 100)).toBe("paid");
    expect(canWaive("due")).toBe(true);
    expect(canWaive("partial")).toBe(true);
    expect(canWaive("paid")).toBe(false);
    expect(canWaive("waived")).toBe(false);
  });
});

describe("الإجماليات", () => {
  it("المعفى خارج المستحق والمتبقي، والمحصَّل يشمل كل المدفوع", () => {
    const totals = computeTotals([
      { status: "paid", amountDueCents: 10000, amountPaidCents: 10000 },
      { status: "partial", amountDueCents: 10000, amountPaidCents: 3000 },
      { status: "due", amountDueCents: 10000, amountPaidCents: 0 },
      { status: "waived", amountDueCents: 10000, amountPaidCents: 0 },
    ]);
    expect(totals).toEqual({ dueCents: 30000, collectedCents: 13000, outstandingCents: 17000 });
  });
});

describe("وسوم الفترات", () => {
  it("تطابق الدورية", () => {
    expect(isValidPeriodLabel("monthly", "2026-10")).toBe(true);
    expect(isValidPeriodLabel("monthly", "2026-13")).toBe(false);
    expect(isValidPeriodLabel("monthly", "2026")).toBe(false);
    expect(isValidPeriodLabel("term", "2026-T2")).toBe(true);
    expect(isValidPeriodLabel("term", "2026-T4")).toBe(false);
    expect(isValidPeriodLabel("yearly", "2026")).toBe(true);
    expect(isValidPeriodLabel("once", "once")).toBe(true);
    expect(isValidPeriodLabel("once", "x")).toBe(false);
  });

  it("المقترح الافتراضي صالح دائماً لدوريته", () => {
    for (const period of ["monthly", "term", "yearly", "once"] as const) {
      expect(isValidPeriodLabel(period, defaultPeriodLabel(period, "2026-10-19"))).toBe(true);
    }
  });
});

describe("مدخلات المسارات", () => {
  it("الخطة: تتطلب اسماً ومبلغاً ودورية صالحة", () => {
    expect(parsePlanBody({ name: "اشتراك", amount: "50", period: "monthly" })).toEqual({
      ok: true,
      value: { name: "اشتراك", amountCents: 5000, period: "monthly" },
    });
    expect(parsePlanBody({ name: "", amount: "50", period: "monthly" }).ok).toBe(false);
    expect(parsePlanBody({ name: "x", amount: "-5", period: "monthly" }).ok).toBe(false);
    expect(parsePlanBody({ name: "x", amount: "5", period: "weekly" }).ok).toBe(false);
    expect(parsePlanBody({ active: false }, true)).toEqual({ ok: true, value: { active: false } });
  });

  it("التوليد: حلقات مكرّرة تُدمج، ومعرّفات غير صالحة ترفض", () => {
    const ok = parseGenerateBody({ planId: 3, periodLabel: "2026-10", halaqahIds: [1, "2", 1], dueDate: "2026-10-05" });
    expect(ok).toEqual({ ok: true, value: { planId: 3, periodLabel: "2026-10", halaqahIds: [1, 2], dueDate: "2026-10-05" } });
    expect(parseGenerateBody({ planId: 3, periodLabel: "2026-10", halaqahIds: [] }).ok).toBe(false);
    expect(parseGenerateBody({ planId: 3, periodLabel: "2026-10", halaqahIds: [-1] }).ok).toBe(false);
    expect(parseGenerateBody({ planId: 0, periodLabel: "2026-10", halaqahIds: [1] }).ok).toBe(false);
    expect(parseGenerateBody({ planId: 3, periodLabel: "2026-10", halaqahIds: [1], dueDate: "غد" }).ok).toBe(false);
  });

  it("الدفعة: مبلغ موجب وطريقة معروفة", () => {
    expect(parsePaymentBody({ amount: "25.5", method: "transfer", note: " ملاحظة " })).toEqual({
      ok: true,
      value: { amountCents: 2550, method: "transfer", note: "ملاحظة" },
    });
    expect(parsePaymentBody({ amount: "0" }).ok).toBe(false);
    expect(parsePaymentBody({ amount: "5", method: "bitcoin" }).ok).toBe(false);
    expect(parsePaymentBody({ amount: "5" })).toMatchObject({ ok: true, value: { method: "cash" } });
  });

  it("رقم الإيصال", () => {
    expect(receiptNumber(123, "2026-10-19T10:00:00.000Z")).toBe("2026-000123");
  });
});

describe("CSV", () => {
  const row = {
    studentName: "أحمد",
    halaqahName: "حلقة النور",
    planName: "اشتراك شهري",
    periodLabel: "2026-10",
    amountDueCents: 10000,
    amountPaidCents: 2500,
    status: "partial" as const,
    dueDate: "2026-10-05",
  };

  it("BOM + ترويسة + صف بمبالغ عشرية دقيقة والمتبقي", () => {
    const csv = buildFeesCsv([row]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe("الطالب,الحلقة,الخطة,الفترة,المستحق,المدفوع,المتبقي,الحالة,تاريخ الاستحقاق");
    expect(lines[1]).toBe("أحمد,حلقة النور,اشتراك شهري,2026-10,100.00,25.00,75.00,مدفوع جزئياً,2026-10-05");
  });

  it("المعفى متبقيه صفر", () => {
    const csv = buildFeesCsv([{ ...row, status: "waived", amountPaidCents: 0 }]);
    expect(csv.split("\r\n")[1]).toContain(",100.00,0.00,0.00,معفى,");
  });

  it("يهرّب الفواصل والتنصيص والأسطر", () => {
    expect(csvCell('اسم, "كبير"')).toBe('"اسم, ""كبير"""');
    expect(csvCell("سطر\nثان")).toBe('"سطر\nثان"');
  });

  it("يمنع حقن الصيغ في Excel", () => {
    expect(csvCell("=HYPERLINK(\"x\")").startsWith('"\'=')).toBe(true);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1+2")).toBe("'-1+2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell(-5)).toBe("-5"); // الأرقام الحقيقية لا تُمسّ
  });

  it("قائمة فارغة = ترويسة فقط", () => {
    expect(buildFeesCsv([]).slice(1).split("\r\n")).toHaveLength(1);
  });
});
