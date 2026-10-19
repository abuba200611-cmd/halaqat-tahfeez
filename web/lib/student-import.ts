import { parseBirthYear } from "./enrollment";

/*
  استيراد الطلاب من Excel/CSV — منطق نقي بلا قاعدة بيانات ولا مكتبة xlsx (يُختبر مباشرة):
  تحويل الجدول الخام إلى صفوف بأعمدة معروفة، ثم تحقق كل صف برسائل عربية، وكشف
  التكرار (نفس الاسم + الجوال) داخل الجامع وداخل الملف نفسه، وحدّ السعة.
  الخادم يعيد تحليل الملف والتحقق منه عند التأكيد؛ لا يُوثَق بشيء من المعاينة.
*/

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_NAME_LENGTH = 100;
export const MAX_NOTES_LENGTH = 500;

export type ImportColumn = "name" | "phone" | "parentPhone" | "birthYear" | "halaqah" | "notes";

/** رؤوس الأعمدة المقبولة (عربي/إنجليزي) بعد التطبيع */
const HEADER_ALIASES: Record<ImportColumn, string[]> = {
  name: ["الاسم", "اسم الطالب", "اسم", "name", "student name", "full name"],
  phone: ["الجوال", "رقم الجوال", "جوال", "الهاتف", "رقم الهاتف", "phone", "mobile"],
  parentPhone: ["جوال ولي الامر", "جوال ولي الأمر", "رقم ولي الامر", "هاتف ولي الامر", "parent phone", "parent_phone", "parentphone", "guardian phone"],
  birthYear: ["سنه الميلاد", "سنة الميلاد", "تاريخ الميلاد", "birth year", "birth_year", "birthyear", "year of birth"],
  halaqah: ["الحلقه", "الحلقة", "اسم الحلقه", "اسم الحلقة", "halaqah", "halaqa", "circle"],
  notes: ["ملاحظات", "ملاحظه", "notes", "note"],
};

export type CellValue = string | number | boolean | Date | null | undefined;
export type RawTable = CellValue[][];

/** صف خام: كل القيم نصوص، و`line` رقم الصف كما يراه المستخدم في الملف (الرأس = 1) */
export type RawRow = {
  line: number;
  name: string;
  phone: string;
  parentPhone: string;
  birthYear: string;
  halaqah: string;
  notes: string;
};

export type TableResult = { ok: true; rows: RawRow[] } | { ok: false; error: string };

const DIACRITICS = /[ً-ٰٟـ]/g;

/** تطبيع اسم/رأس للمقارنة: أحرف صغيرة، بلا تشكيل/تطويل، ألف/ياء موحّدة، مسافات مطوية */
export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** أرقام عربية/فارسية → لاتينية، ثم الأرقام فقط */
export function digitsOnly(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
}

/** مفتاح مقارنة الجوال: آخر ٩ أرقام (يتجاوز رمز الدولة والصفر البادئ) */
export function phoneKey(phone: string): string {
  const digits = digitsOnly(phone);
  return digits.length > 9 ? digits.slice(-9) : digits;
}

export function duplicateKey(name: string, phone: string): string {
  return `${normalizeText(name)}|${phoneKey(phone)}`;
}

function cellToString(cell: CellValue): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? "" : cell.toISOString().slice(0, 10);
  if (typeof cell === "number") return Number.isFinite(cell) ? String(cell) : "";
  return String(cell).trim();
}

function columnFor(header: string): ImportColumn | null {
  const normalized = normalizeText(header);
  for (const column of Object.keys(HEADER_ALIASES) as ImportColumn[]) {
    if (HEADER_ALIASES[column].some((alias) => normalizeText(alias) === normalized)) return column;
  }
  return null;
}

/** يحوّل جدولاً خاماً (أول صف غير فارغ = الرؤوس) إلى صفوف، مع حدّ ١٠٠٠ صف */
export function tableToRows(table: RawTable): TableResult {
  const headerIndex = table.findIndex((row) => row.some((cell) => cellToString(cell) !== ""));
  if (headerIndex === -1) return { ok: false, error: "الملف فارغ" };

  const columns = new Map<number, ImportColumn>();
  table[headerIndex].forEach((cell, index) => {
    const column = columnFor(cellToString(cell));
    if (column && ![...columns.values()].includes(column)) columns.set(index, column);
  });
  if (![...columns.values()].includes("name")) {
    return { ok: false, error: "لم يُعثر على عمود «الاسم» في الصف الأول — استخدم القالب" };
  }

  const rows: RawRow[] = [];
  for (let i = headerIndex + 1; i < table.length; i += 1) {
    const cells = table[i];
    const row: RawRow = { line: i + 1, name: "", phone: "", parentPhone: "", birthYear: "", halaqah: "", notes: "" };
    let any = false;
    columns.forEach((column, index) => {
      const value = cellToString(cells[index]);
      if (value !== "") any = true;
      row[column] = value;
    });
    if (!any) continue;
    if (rows.length >= MAX_IMPORT_ROWS) {
      return { ok: false, error: `الملف يتجاوز الحد الأقصى (${MAX_IMPORT_ROWS} صف)` };
    }
    rows.push(row);
  }
  if (rows.length === 0) return { ok: false, error: "لا توجد صفوف بيانات تحت الرؤوس" };
  return { ok: true, rows };
}

// ————— CSV —————

/** يفكّ بايتات CSV: UTF-8 (مع/بلا BOM)، وإن بدا غير صالح يُجرَّب windows-1256 (حفظ Excel العربي) */
export function decodeCsvBytes(bytes: Uint8Array): string {
  let text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.includes("�")) {
    try {
      text = new TextDecoder("windows-1256").decode(bytes);
    } catch {
      // يبقى فكّ UTF-8
    }
  }
  return text.replace(/^﻿/, "");
}

/** محلّل CSV: يدعم علامات الاقتباس المزدوجة والأسطر داخلها، والفاصل , ; أو Tab (يُكشف من أول سطر) */
export function parseCsv(text: string): RawTable {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch as keyof typeof counts] += 1;
  }
  const delimiter = (Object.keys(counts) as (keyof typeof counts)[]).reduce((best, key) => (counts[key] > counts[best] ? key : best), ",");

  const table: RawTable = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      table.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    table.push(row);
  }
  return table;
}

/** قالب CSV للتنزيل (BOM ليفتح بالعربية سليماً في Excel). عمود الحلقة للمدير فقط */
export function importTemplateCsv(admin: boolean): string {
  const headers = admin
    ? ["الاسم", "الجوال", "جوال ولي الأمر", "سنة الميلاد", "الحلقة", "ملاحظات"]
    : ["الاسم", "الجوال", "جوال ولي الأمر", "سنة الميلاد", "ملاحظات"];
  const sample = admin
    ? ["أحمد محمد", "0501234567", "0507654321", "2014", "حلقة الفجر", ""]
    : ["أحمد محمد", "0501234567", "0507654321", "2014", ""];
  return `﻿${headers.join(",")}\r\n${sample.join(",")}\r\n`;
}

// ————— التحقق —————

export type ImportHalaqah = { id: number; name: string; capacity: number | null; count: number };
export type ExistingPerson = { name: string; phone: string };

export type ImportContext = {
  admin: boolean;
  currentYear: number;
  /** الحلقات المتاحة: كل حلقات الجامع للمدير، وحلقة المعلّم وحدها له */
  halaqat: readonly ImportHalaqah[];
  /** حلقة المعلّم (إجبارية له، تُتجاهل عند المدير) */
  teacherHalaqahId: number | null;
  /** أسماء+جوالات الموجودين بالجامع (طلاب وتسجيلات) لكشف التكرار */
  existing: readonly ExistingPerson[];
};

export type RowStatus = "ok" | "error" | "duplicate";

export type RowResult = {
  line: number;
  name: string;
  phone: string;
  parentPhone: string;
  birthYear: number | null;
  /** null = بلا حلقة ← يدخل قائمة التسجيلات (مدير فقط) */
  halaqahId: number | null;
  halaqahName: string;
  notes: string;
  status: RowStatus;
  errors: string[];
  warnings: string[];
};

export type ImportSummary = { total: number; valid: number; errors: number; duplicates: number };

/** سنة الميلاد كنص من خلية: "2014" أو تاريخ "2014-05-01" (يُؤخذ عامه) أو أرقام عربية */
function birthYearText(raw: string): string | null {
  const text = raw.trim();
  if (text === "") return null;
  const dated = /^(\d{4})-\d{2}-\d{2}/.exec(text);
  if (dated) return dated[1];
  return digitsOnly(text);
}

function cleanPhone(raw: string): { value: string } | { error: string } {
  if (raw === "") return { value: "" };
  const digits = digitsOnly(raw);
  if (digits.length < 7 || digits.length > 15) return { error: "رقم الجوال غير صحيح (٧ إلى ١٥ رقماً)" };
  return { value: digits };
}

export function validateRows(rows: readonly RawRow[], ctx: ImportContext): { rows: RowResult[]; summary: ImportSummary } {
  const seen = new Map<string, number>();
  for (const person of ctx.existing) seen.set(duplicateKey(person.name, person.phone), 0);

  const byName = new Map<string, ImportHalaqah[]>();
  for (const halaqah of ctx.halaqat) {
    const key = normalizeText(halaqah.name);
    byName.set(key, [...(byName.get(key) ?? []), halaqah]);
  }
  const planned = new Map<number, number>();

  const results: RowResult[] = rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const name = row.name.replace(/\s+/g, " ").trim();
    if (!name) errors.push("الاسم مطلوب");
    else if (name.length > MAX_NAME_LENGTH) errors.push(`الاسم أطول من ${MAX_NAME_LENGTH} حرفاً`);

    const phone = cleanPhone(row.phone);
    if ("error" in phone) errors.push(phone.error);
    const parentPhone = cleanPhone(row.parentPhone);
    if ("error" in parentPhone) errors.push(`جوال ولي الأمر: ${parentPhone.error}`);

    const birth = parseBirthYear(birthYearText(row.birthYear), ctx.currentYear);
    if (birth === "invalid") errors.push("سنة الميلاد غير صحيحة");

    const notes = row.notes.trim();
    if (notes.length > MAX_NOTES_LENGTH) errors.push(`الملاحظات أطول من ${MAX_NOTES_LENGTH} حرفاً`);

    let halaqah: ImportHalaqah | null = null;
    if (ctx.admin) {
      if (row.halaqah.trim() !== "") {
        const matches = byName.get(normalizeText(row.halaqah)) ?? [];
        if (matches.length === 0) errors.push(`الحلقة «${row.halaqah.trim()}» غير موجودة في هذا الجامع`);
        else if (matches.length > 1) errors.push(`اسم الحلقة «${row.halaqah.trim()}» مكرر في الجامع — غيّر أحد الاسمين`);
        else halaqah = matches[0];
      } else {
        warnings.push("بلا حلقة: يُسجَّل بقائمة التوزيع (لا يُحفظ جوال ولي الأمر ولا الملاحظات)");
      }
    } else {
      halaqah = ctx.halaqat.find((h) => h.id === ctx.teacherHalaqahId) ?? null;
      if (!halaqah) errors.push("حلقتك غير متاحة للاستيراد");
      else if (row.halaqah.trim() !== "") warnings.push("عمود الحلقة يُتجاهل — الطلاب يُضافون لحلقتك");
    }

    const base = {
      line: row.line,
      name,
      phone: "value" in phone ? phone.value : "",
      parentPhone: "value" in parentPhone ? parentPhone.value : "",
      birthYear: typeof birth === "number" ? birth : null,
      halaqahId: halaqah?.id ?? null,
      halaqahName: halaqah?.name ?? "",
      notes,
      warnings,
    };
    if (errors.length > 0) return { ...base, status: "error" as const, errors };

    const key = duplicateKey(base.name, base.phone);
    const firstLine = seen.get(key);
    if (firstLine !== undefined) {
      const message = firstLine === 0 ? "مكرر: يوجد طالب بنفس الاسم والجوال في الجامع" : `مكرر: نفس الاسم والجوال في الصف ${firstLine} من الملف`;
      return { ...base, status: "duplicate" as const, errors: [message] };
    }

    if (halaqah && halaqah.capacity !== null) {
      const used = halaqah.count + (planned.get(halaqah.id) ?? 0);
      if (used >= halaqah.capacity) {
        return { ...base, status: "error" as const, errors: [`الحلقة «${halaqah.name}» ممتلئة (${halaqah.capacity} طالباً)`] };
      }
    }

    seen.set(key, row.line);
    if (halaqah) planned.set(halaqah.id, (planned.get(halaqah.id) ?? 0) + 1);
    return { ...base, status: "ok" as const, errors: [] };
  });

  return {
    rows: results,
    summary: {
      total: results.length,
      valid: results.filter((r) => r.status === "ok").length,
      errors: results.filter((r) => r.status === "error").length,
      duplicates: results.filter((r) => r.status === "duplicate").length,
    },
  };
}
