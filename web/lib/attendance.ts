/*
  STEP 62 — الحضور اليومي: منطق نقي (بلا قاعدة بيانات) يشاركه الخادم
  والواجهة والاختبارات. الصفّ المخزَّن هو القرار الصريح للمعلّم؛ الحضور
  الضمني (أرسل الطالب ورداً بذلك اليوم) يُشتقّ هنا ولا يُخزَّن أبداً.
*/

export const ATTENDANCE_STATUSES = ["present", "late", "excused", "absent"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "حاضر",
  late: "متأخر",
  excused: "مستأذن",
  absent: "غائب",
};

export const ATTENDANCE_NOTE_MAX = 200;
export const ATTENDANCE_SUMMARY_DAYS = 30;

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return typeof value === "string" && (ATTENDANCE_STATUSES as readonly string[]).includes(value);
}

/** YYYY-MM-DD صالح تقويمياً (يرفض 2026-02-31) */
export function isValidAttendanceDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** تاريخ YYYY-MM-DD قبل `days` يوماً من `from` (حساب تقويمي بـUTC) */
export function daysBeforeISO(from: string, days: number): string {
  return new Date(Date.parse(from) - days * 86400000).toISOString().slice(0, 10);
}

export type StoredAttendance = {
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
  /** 'qr' = سجّله الطالب بمسح الرمز (ميزة qr_attendance)، غائب = تسجيل يدوي */
  source?: string | null;
  /** آخر تحديث للصفّ (ISO) — يُعرض لتسجيلات الرمز */
  at?: string | null;
};

export type AttendanceRow = {
  studentId: string;
  name: string;
  status: AttendanceStatus | null;
  /** true لو الحالة مشتقّة من ورد مرسَل (لا صفّ مخزَّن) */
  implicit: boolean;
  note: string;
  /** سجّله الطالب بمسح الرمز (ولم يغيّره المعلّم لحالة أخرى) — غائب لغير ذلك */
  viaQr?: true;
  /** وقت التسجيل بالرمز (ISO) */
  at?: string;
};

/** يدمج الطلاب مع القرارات المخزَّنة والحضور الضمني: الصفّ المخزَّن يغلب دائماً */
export function mergeDayAttendance(
  students: { id: string; name: string }[],
  stored: StoredAttendance[],
  wardStudentIds: Iterable<string>,
): AttendanceRow[] {
  const storedById = new Map(stored.map((s) => [s.studentId, s]));
  const withWard = new Set(wardStudentIds);
  return students.map((s) => {
    const row = storedById.get(s.id);
    if (row) {
      const viaQr = row.source === "qr" && row.status === "present";
      return {
        studentId: s.id,
        name: s.name,
        status: row.status,
        implicit: false,
        note: row.note ?? "",
        ...(viaQr ? { viaQr: true as const, ...(row.at ? { at: row.at } : {}) } : {}),
      };
    }
    if (withWard.has(s.id)) return { studentId: s.id, name: s.name, status: "present", implicit: true, note: "" };
    return { studentId: s.id, name: s.name, status: null, implicit: false, note: "" };
  });
}

export type AttendanceCounts = Record<AttendanceStatus, number> & { unmarked: number };

export function countAttendance(rows: { status: AttendanceStatus | null }[]): AttendanceCounts {
  const counts: AttendanceCounts = { present: 0, late: 0, excused: 0, absent: 0, unmarked: 0 };
  for (const r of rows) counts[r.status ?? "unmarked"] += 1;
  return counts;
}

export type AttendanceSummary = {
  /** أيام محسوبة لهذا الطالب (صفّ مخزَّن أو ورد مرسَل) خلال النافذة */
  days: number;
  present: number;
  late: number;
  excused: number;
  absent: number;
  /** نسبة الحضور = (حاضر + متأخر) ÷ الأيام المحسوبة، أو null بلا أي يوم */
  presentPct: number | null;
};

/**
 * ملخّص آخر ٣٠ يوماً لطالب واحد. اليوم المحسوب = صفّ مخزَّن، أو يوم فيه ورد
 * بلا صفّ مخزَّن (حضور ضمني). المستأذن يُحسب يوماً لكنه لا يُعدّ حضوراً ولا غياباً.
 */
export function summarizeAttendance(
  stored: { date: string; status: AttendanceStatus }[],
  wardDates: string[],
  today: string,
): AttendanceSummary {
  const since = daysBeforeISO(today, ATTENDANCE_SUMMARY_DAYS - 1);
  const byDate = new Map<string, AttendanceStatus>();
  for (const d of wardDates) if (d >= since && d <= today) byDate.set(d, "present");
  for (const r of stored) if (r.date >= since && r.date <= today) byDate.set(r.date, r.status);

  const summary: AttendanceSummary = { days: byDate.size, present: 0, late: 0, excused: 0, absent: 0, presentPct: null };
  for (const status of byDate.values()) summary[status] += 1;
  if (summary.days > 0) summary.presentPct = Math.round(((summary.present + summary.late) / summary.days) * 100);
  return summary;
}
