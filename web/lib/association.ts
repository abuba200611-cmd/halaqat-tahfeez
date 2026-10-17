/*
  A3 — مستوى الجمعية: منطق نقي (بلا قاعدة بيانات ولا cookies) يشاركه الخادم
  والواجهة والاختبارات. الجمعية تقرأ جوامعها فقط (قراءة بلا تعديل): قاعدة
  الانتماء ومجموع المؤشرات وتصدير CSV هنا.
*/

export const ASSOCIATION_NAME_MAX = 100;
export const ASSOCIATION_CITY_MAX = 60;

export type ParsedAssociationBody = { ok: true; name: string; city: string } | { ok: false; error: string };

export function parseAssociationBody(body: unknown): ParsedAssociationBody {
  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const name = String(raw.name ?? "").trim();
  const city = String(raw.city ?? "").trim();
  if (name.length < 2 || name.length > ASSOCIATION_NAME_MAX) {
    return { ok: false, error: `اسم الجمعية من ٢ إلى ${ASSOCIATION_NAME_MAX} حرفاً` };
  }
  if (city.length > ASSOCIATION_CITY_MAX) return { ok: false, error: `المدينة حتى ${ASSOCIATION_CITY_MAX} حرفاً` };
  return { ok: true, name, city };
}

export type ParsedAdminBody =
  | { ok: true; username: string; password: string }
  | { ok: false; error: string };

/** اسم مستخدم بحروف لاتينية صغيرة وأرقام و ._- (٣..٤٠)، وكلمة مرور ٨+ */
export function parseAssociationAdminBody(body: unknown): ParsedAdminBody {
  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const username = String(raw.username ?? "").trim().toLowerCase();
  const password = String(raw.password ?? "");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return { ok: false, error: "اسم المستخدم من ٣ إلى ٤٠ حرفاً لاتينياً صغيراً أو أرقاماً أو ._-" };
  }
  if (password.length < 8 || password.length > 200) return { ok: false, error: "كلمة المرور من ٨ أحرف إلى ٢٠٠" };
  return { ok: true, username, password };
}

/** الجامع يتبع الجمعية؟ — لا جمعية للجامع (null) أو جمعية أخرى = لا */
export function mosqueBelongsToAssociation(mosqueAssociationId: number | null, adminAssociationId: number): boolean {
  return mosqueAssociationId !== null && mosqueAssociationId === adminAssociationId;
}

export type MosqueKpiRow = {
  mosqueId: number;
  name: string;
  city: string;
  halaqat: number;
  activeStudents: number;
  /** حضور الفترة % — null لا تسجيلات */
  attendanceRate: number | null;
  /** عدد من سجّلت لهم نتيجة اختبار بالفترة وكم منهم نجح */
  examResults: number;
  examPassed: number;
  /** null = ميزة التصاريح غير مفعّلة لهذا الجامع */
  permits: PermitCounts | null;
};

export type PermitCounts = { active: number; suspended: number; withdrawn: number; pendingRenewal: number };

/** نسبة مئوية صحيحة أو null عندما لا مقام */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

export type AssociationTotals = {
  mosques: number;
  halaqat: number;
  activeStudents: number;
  /** متوسط حضور الجوامع المرجَّح بعدد الطلاب (الجوامع بلا حضور تُستثنى) */
  attendanceRate: number | null;
  examResults: number;
  examPassed: number;
  permits: PermitCounts;
};

export function consolidate(rows: MosqueKpiRow[]): AssociationTotals {
  let weighted = 0;
  let weight = 0;
  const permits: PermitCounts = { active: 0, suspended: 0, withdrawn: 0, pendingRenewal: 0 };
  for (const row of rows) {
    if (row.attendanceRate !== null && row.activeStudents > 0) {
      weighted += row.attendanceRate * row.activeStudents;
      weight += row.activeStudents;
    }
    if (row.permits) {
      permits.active += row.permits.active;
      permits.suspended += row.permits.suspended;
      permits.withdrawn += row.permits.withdrawn;
      permits.pendingRenewal += row.permits.pendingRenewal;
    }
  }
  return {
    mosques: rows.length,
    halaqat: rows.reduce((s, r) => s + r.halaqat, 0),
    activeStudents: rows.reduce((s, r) => s + r.activeStudents, 0),
    attendanceRate: weight > 0 ? Math.round(weighted / weight) : null,
    examResults: rows.reduce((s, r) => s + r.examResults, 0),
    examPassed: rows.reduce((s, r) => s + r.examPassed, 0),
    permits,
  };
}

/** خلية CSV آمنة: تُقتبس عند الحاجة، وتُحصَّن البادئات التي يفسّرها Excel كمعادلة */
export function csvCell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const CSV_HEADERS = [
  "الجامع",
  "المدينة",
  "الحلقات",
  "الطلاب الفعّالون",
  "نسبة الحضور %",
  "نتائج الاختبارات",
  "الناجحون",
  "تصاريح فعّالة",
  "تصاريح موقوفة",
  "تصاريح مسحوبة",
  "بانتظار التجديد",
] as const;

/** تقرير الجمعية المجمّع بصيغة CSV (BOM في البداية ليفتحه Excel بالعربية) + صف الإجمالي */
export function buildAssociationCsv(rows: MosqueKpiRow[]): string {
  const lines: string[] = [CSV_HEADERS.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.name,
        row.city,
        row.halaqat,
        row.activeStudents,
        row.attendanceRate,
        row.examResults,
        row.examPassed,
        row.permits?.active ?? null,
        row.permits?.suspended ?? null,
        row.permits?.withdrawn ?? null,
        row.permits?.pendingRenewal ?? null,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const t = consolidate(rows);
  lines.push(
    [
      "الإجمالي",
      "",
      t.halaqat,
      t.activeStudents,
      t.attendanceRate,
      t.examResults,
      t.examPassed,
      t.permits.active,
      t.permits.suspended,
      t.permits.withdrawn,
      t.permits.pendingRenewal,
    ]
      .map(csvCell)
      .join(","),
  );
  return `﻿${lines.join("\r\n")}\r\n`;
}

// ————— فترة التقرير —————

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PERIOD_DAYS = 400;

function isRealISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

export type ParsedAssociationPeriod = { ok: true; from: string; to: string } | { ok: false; error: string };

/** ?from=&to= (YYYY-MM-DD)؛ الغائبان = الافتراضي، والمعطوب أو المقلوب أو الأطول من ٤٠٠ يوم = رفض */
export function parseAssociationPeriod(
  params: URLSearchParams,
  fallback: { from: string; to: string },
): ParsedAssociationPeriod {
  const from = params.get("from");
  const to = params.get("to");
  if (from === null && to === null) return { ok: true, ...fallback };
  if (from === null || to === null || !isRealISODate(from) || !isRealISODate(to)) {
    return { ok: false, error: "فترة غير صالحة (YYYY-MM-DD)" };
  }
  if (from > to) return { ok: false, error: "بداية الفترة بعد نهايتها" };
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days > MAX_PERIOD_DAYS) return { ok: false, error: `الفترة أطول من ${MAX_PERIOD_DAYS} يوماً` };
  return { ok: true, from, to };
}
