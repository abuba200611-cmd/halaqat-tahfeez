/*
  CSV آمن لتصدير التكاملات. خلية نصية تبدأ بـ = + - @ أو TAB أو CR تُسبق
  بفاصلة عليا (') لمنع حقن الصيغ في Excel/Sheets. الأرقام الحقيقية (number)
  لا تُعدَّل. التنصيص عند الفاصلة/السطر/التنصيص.
*/

export type CsvValue = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (typeof value === "string" && FORMULA_START.test(str)) str = `'${str}`;
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** CSV كامل بـBOM ليفتح Excel العربية صحيحة، وفواصل أسطر CRLF */
export function buildCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return "﻿" + lines.join("\r\n");
}
