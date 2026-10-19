import "server-only";

import { readSheet } from "read-excel-file/node";
import { MAX_IMPORT_BYTES, decodeCsvBytes, parseCsv, tableToRows, type RawRow, type RawTable } from "./student-import";

/*
  قراءة ملف الاستيراد على الخادم فقط (لا يُوثَق بتحليل العميل): .xlsx عبر
  read-excel-file (MIT)، و.csv بمحلّلنا. يُفحص الحجم والامتداد وبصمة الملف قبل
  التحليل، وأي خطأ تحليل يتحوّل لرسالة عربية عامة بلا تسريب تفاصيل المكتبة.
*/

export type ParsedImport = { ok: true; rows: RawRow[] } | { ok: false; error: string; status: number };

const fail = (error: string, status = 400): ParsedImport => ({ ok: false, error, status });

/** بصمة zip (xlsx حاوية zip) */
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function parseImportFile(file: { name: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> }): Promise<ParsedImport> {
  const lower = file.name.toLowerCase();
  const isXlsx = lower.endsWith(".xlsx");
  const isCsv = lower.endsWith(".csv");
  if (!isXlsx && !isCsv) return fail("نوع الملف غير مدعوم — ارفع .xlsx أو .csv");
  if (file.size > MAX_IMPORT_BYTES) return fail("حجم الملف يتجاوز ٢ ميغابايت", 413);
  if (file.size === 0) return fail("الملف فارغ");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_IMPORT_BYTES) return fail("حجم الملف يتجاوز ٢ ميغابايت", 413);

  let table: RawTable;
  try {
    if (isXlsx) {
      if (!looksLikeZip(bytes)) return fail("الملف ليس بصيغة .xlsx سليمة");
      table = (await readSheet(Buffer.from(bytes))) as RawTable;
    } else {
      table = parseCsv(decodeCsvBytes(bytes));
    }
  } catch {
    return fail("تعذّرت قراءة الملف — تأكد أنه سليم وغير محمي بكلمة مرور");
  }

  const result = tableToRows(table);
  return result.ok ? { ok: true, rows: result.rows } : fail(result.error, 422);
}
