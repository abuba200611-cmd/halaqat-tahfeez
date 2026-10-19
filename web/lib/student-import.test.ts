import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  decodeCsvBytes,
  duplicateKey,
  importTemplateCsv,
  parseCsv,
  tableToRows,
  validateRows,
  type ImportContext,
  type RawRow,
} from "./student-import";

const raw = (over: Partial<RawRow> & { line: number }): RawRow => ({
  name: "",
  phone: "",
  parentPhone: "",
  birthYear: "",
  halaqah: "",
  notes: "",
  ...over,
});

const adminCtx = (over: Partial<ImportContext> = {}): ImportContext => ({
  admin: true,
  currentYear: 2026,
  halaqat: [
    { id: 1, name: "حلقة الفجر", capacity: null, count: 0 },
    { id: 2, name: "حلقة العصر", capacity: 2, count: 1 },
  ],
  teacherHalaqahId: null,
  existing: [],
  ...over,
});

describe("CSV", () => {
  it("اقتباس وفواصل وأسطر داخل الخلية", () => {
    const table = parseCsv('الاسم,ملاحظات\r\n"أحمد، محمد","سطر 1\nسطر 2"\r\nعلي,"قال ""مرحبا"""\r\n');
    expect(table).toEqual([
      ["الاسم", "ملاحظات"],
      ["أحمد، محمد", "سطر 1\nسطر 2"],
      ["علي", 'قال "مرحبا"'],
    ]);
  });
  it("يكشف الفاصلة المنقوطة (Excel العربي)", () => {
    expect(parseCsv("الاسم;الجوال\nسالم;0501234567")).toEqual([
      ["الاسم", "الجوال"],
      ["سالم", "0501234567"],
    ]);
  });
  it("يزيل BOM ويقرأ UTF-8", () => {
    const bytes = new TextEncoder().encode("﻿الاسم\nعمر");
    expect(decodeCsvBytes(bytes)).toBe("الاسم\nعمر");
  });
  it("يقرأ windows-1256 عند فشل UTF-8", () => {
    // "اسم" بترميز cp1256: ا=0xC7 س=0xD3 م=0xE3
    expect(decodeCsvBytes(new Uint8Array([0xc7, 0xd3, 0xe3]))).toBe("اسم");
  });
  it("القالب يحوي عمود الحلقة للمدير فقط", () => {
    expect(importTemplateCsv(true).split("\r\n")[0]).toContain("الحلقة");
    expect(importTemplateCsv(false).split("\r\n")[0]).not.toContain("الحلقة");
  });
});

describe("tableToRows", () => {
  it("يطابق الرؤوس العربية والإنجليزية ويتجاهل المجهول والصفوف الفارغة", () => {
    const result = tableToRows([
      ["Name", "رقم الجوال", "Parent Phone", "سنة الميلاد", "عمود غريب"],
      ["أحمد", 501234567, "0507654321", 2014, "x"],
      [null, null, null, null, null],
      ["سارة", "", "", "", ""],
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({ line: 2, name: "أحمد", phone: "501234567", parentPhone: "0507654321", birthYear: "2014" });
    expect(result.rows[1].line).toBe(4);
  });
  it("بلا عمود الاسم = خطأ", () => {
    expect(tableToRows([["الجوال"], ["0501234567"]])).toMatchObject({ ok: false });
  });
  it("ملف فارغ أو بلا صفوف", () => {
    expect(tableToRows([])).toMatchObject({ ok: false });
    expect(tableToRows([["الاسم"]])).toMatchObject({ ok: false });
  });
  it("حدّ ١٠٠٠ صف: ١٠٠٠ مقبول و١٠٠١ مرفوض", () => {
    const make = (n: number) => [["الاسم"], ...Array.from({ length: n }, (_, i) => [`طالب ${i}`])];
    expect(tableToRows(make(MAX_IMPORT_ROWS)).ok).toBe(true);
    expect(tableToRows(make(MAX_IMPORT_ROWS + 1))).toMatchObject({ ok: false });
  });
});

describe("validateRows", () => {
  it("اسم مطلوب وجوال وسنة ميلاد صحيحان (رسائل عربية لكل صف)", () => {
    const { rows, summary } = validateRows(
      [
        raw({ line: 2, name: "" }),
        raw({ line: 3, name: "أحمد", phone: "12" }),
        raw({ line: 4, name: "علي", birthYear: "1900" }),
        raw({ line: 5, name: "سالم", phone: "٠٥٠١٢٣٤٥٦٧", birthYear: "٢٠١٤", parentPhone: "+966 50 765 4321" }),
      ],
      adminCtx(),
    );
    expect(rows[0].errors).toEqual(["الاسم مطلوب"]);
    expect(rows[1].errors[0]).toContain("رقم الجوال غير صحيح");
    expect(rows[2].errors).toEqual(["سنة الميلاد غير صحيحة"]);
    expect(rows[3]).toMatchObject({ status: "ok", phone: "0501234567", birthYear: 2014, parentPhone: "966507654321" });
    expect(summary).toEqual({ total: 4, valid: 1, errors: 3, duplicates: 0 });
  });

  it("الحلقة: تُحلّ بالاسم المطبَّع، والمجهولة خطأ، والفارغة تعني قائمة التسجيلات", () => {
    const { rows } = validateRows(
      [
        raw({ line: 2, name: "أ", halaqah: "حلقة الفَجر" }),
        raw({ line: 3, name: "ب", halaqah: "حلقة غائبة" }),
        raw({ line: 4, name: "ج" }),
      ],
      adminCtx(),
    );
    expect(rows[0]).toMatchObject({ status: "ok", halaqahId: 1 });
    expect(rows[1].errors[0]).toContain("غير موجودة");
    expect(rows[2]).toMatchObject({ status: "ok", halaqahId: null });
    expect(rows[2].warnings.length).toBe(1);
  });

  it("اسم حلقة مكرر بالجامع = خطأ لا تخمين", () => {
    const ctx = adminCtx({
      halaqat: [
        { id: 1, name: "الفجر", capacity: null, count: 0 },
        { id: 2, name: "الفجر", capacity: null, count: 0 },
      ],
    });
    expect(validateRows([raw({ line: 2, name: "أ", halaqah: "الفجر" })], ctx).rows[0].errors[0]).toContain("مكرر");
  });

  it("تكرار مع الموجودين بالجامع (اسم مطبَّع + جوال بآخر ٩ أرقام)", () => {
    const ctx = adminCtx({ existing: [{ name: "أحمد  محمد", phone: "0501234567" }] });
    const { rows, summary } = validateRows(
      [
        raw({ line: 2, name: "احمد محمد", phone: "+966501234567" }),
        raw({ line: 3, name: "أحمد محمد", phone: "0509999999" }),
      ],
      ctx,
    );
    expect(rows[0].status).toBe("duplicate");
    expect(rows[1].status).toBe("ok");
    expect(summary.duplicates).toBe(1);
  });

  it("تكرار داخل الملف: الأول يُقبل والثاني مكرر مع رقم صف الأول", () => {
    const { rows } = validateRows(
      [raw({ line: 2, name: "خالد", phone: "0501111111" }), raw({ line: 9, name: "خالد", phone: "0501111111" })],
      adminCtx(),
    );
    expect(rows[0].status).toBe("ok");
    expect(rows[1].status).toBe("duplicate");
    expect(rows[1].errors[0]).toContain("الصف 2");
  });

  it("نفس الاسم بلا جوال مرتين = مكرر؛ بجوالين مختلفين = مختلفان", () => {
    const { rows } = validateRows(
      [raw({ line: 2, name: "علي" }), raw({ line: 3, name: "علي" }), raw({ line: 4, name: "علي", phone: "0502222222" })],
      adminCtx(),
    );
    expect(rows.map((r) => r.status)).toEqual(["ok", "duplicate", "ok"]);
  });

  it("السعة: المقاعد المتبقية تُحسب عبر الصفوف، والزائد خطأ", () => {
    // حلقة العصر: سعة ٢، فيها ١ ← مقعد واحد فقط
    const { rows } = validateRows(
      [raw({ line: 2, name: "أ", halaqah: "حلقة العصر" }), raw({ line: 3, name: "ب", halaqah: "حلقة العصر" })],
      adminCtx(),
    );
    expect(rows[0].status).toBe("ok");
    expect(rows[1].status).toBe("error");
    expect(rows[1].errors[0]).toContain("ممتلئة");
  });

  it("المعلّم: كل الصفوف لحلقته، وعمود الحلقة يُتجاهل مع تنبيه (لا حلقة غيره)", () => {
    const ctx = adminCtx({
      admin: false,
      teacherHalaqahId: 1,
      halaqat: [{ id: 1, name: "حلقة الفجر", capacity: null, count: 0 }],
    });
    const { rows } = validateRows([raw({ line: 2, name: "أ", halaqah: "حلقة العصر" }), raw({ line: 3, name: "ب" })], ctx);
    expect(rows.every((r) => r.halaqahId === 1)).toBe(true);
    expect(rows[0].warnings.length).toBe(1);
    expect(rows[1].warnings).toEqual([]);
  });

  it("المعلّم بلا حلقة متاحة ← خطأ لكل صف", () => {
    const ctx = adminCtx({ admin: false, teacherHalaqahId: 99, halaqat: [] });
    expect(validateRows([raw({ line: 2, name: "أ" })], ctx).rows[0].status).toBe("error");
  });

  it("مفتاح التكرار مستقر", () => {
    expect(duplicateKey("أَحمد", "0501234567")).toBe(duplicateKey("احمد", "+966501234567"));
  });
});
