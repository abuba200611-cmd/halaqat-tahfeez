import "server-only";

import { db } from "./db";
import {
  daysBeforeISO,
  ATTENDANCE_SUMMARY_DAYS,
  summarizeAttendance,
  type AttendanceStatus,
  type AttendanceSummary,
  type StoredAttendance,
} from "./attendance";

/*
  STEP 62 — الوصول لجدول attendance. ملف مستقل حتى لا يتضخّم lib/db.ts.
  halaqahId يطابق students.teacher_id (الحلقة). لا استعلام هنا يقبل
  معرّف حلقة من العميل — المسارات تمرّره من الجلسة فقط.
*/

export type DayData = {
  students: { id: string; name: string }[];
  stored: StoredAttendance[];
  wardStudentIds: string[];
};

/** طلاب الحلقة الفعّالون غير المحذوفين مع قرارات اليوم المخزَّنة والطلاب الذين أرسلوا ورداً بذلك اليوم */
export async function getDayAttendanceData(halaqahId: number, date: string): Promise<DayData> {
  const [students, stored, wards] = await Promise.all([
    db().sql`
      SELECT id, name FROM students
      WHERE teacher_id = ${halaqahId} AND active AND deleted_at IS NULL
      ORDER BY sort_order, name
    `,
    db().sql`SELECT student_id, status, note, checkin_source, updated_at FROM attendance WHERE halaqah_id = ${halaqahId} AND date = ${date}`,
    db().sql`SELECT DISTINCT student_id FROM ward_logs WHERE teacher_id = ${halaqahId} AND date = ${date}`,
  ]);
  return {
    students: students.map((r) => ({ id: r.id as string, name: r.name as string })),
    stored: stored.map((r) => ({
      studentId: r.student_id as string,
      status: r.status as AttendanceStatus,
      note: (r.note as string | null) ?? null,
      source: (r.checkin_source as string | null) ?? null,
      at: r.updated_at ? new Date(r.updated_at as string | Date).toISOString() : null,
    })),
    wardStudentIds: wards.map((r) => r.student_id as string),
  };
}

export type SetAttendanceResult = { found: false } | { found: true; previous: AttendanceStatus | null };

/**
 * يخزّن/يحدّث قرار طالب ليوم. الشرط (الطالب بنفس الحلقة، فعّال، غير محذوف)
 * داخل الاستعلام نفسه — طالب من حلقة أخرى أو محذوف يرجع found:false بلا أي كتابة.
 * `note === undefined` يُبقي الملاحظة القائمة (ضغط زر الحالة لا يمسح الملاحظة).
 */
export async function setAttendance(
  halaqahId: number,
  studentId: string,
  date: string,
  status: AttendanceStatus,
  note: string | undefined,
  recordedBy: number,
): Promise<SetAttendanceResult> {
  const keepNote = note === undefined;
  const rows = await db().sql`
    WITH prev AS (
      SELECT status FROM attendance
      WHERE halaqah_id = ${halaqahId} AND student_id = ${studentId} AND date = ${date}
    ),
    ins AS (
      INSERT INTO attendance (halaqah_id, student_id, date, status, note, recorded_by, updated_at)
      SELECT s.teacher_id, s.id, ${date}::text, ${status}::text, ${note ?? null}::text, ${recordedBy}::int, now()
      FROM students s
      WHERE s.teacher_id = ${halaqahId} AND s.id = ${studentId} AND s.active AND s.deleted_at IS NULL
      ON CONFLICT (halaqah_id, student_id, date) DO UPDATE SET
        checkin_source = CASE WHEN excluded.status = attendance.status THEN attendance.checkin_source ELSE NULL END,
        status = excluded.status,
        note = CASE WHEN ${keepNote}::boolean THEN attendance.note ELSE excluded.note END,
        recorded_by = excluded.recorded_by,
        updated_at = now()
      RETURNING student_id
    )
    SELECT (SELECT count(*) FROM ins) AS written, (SELECT status FROM prev) AS previous
  `;
  if (Number(rows[0]?.written ?? 0) === 0) return { found: false };
  return { found: true, previous: (rows[0]?.previous as AttendanceStatus | null) ?? null };
}

/** "تحديد الكل حاضر": يخزّن حاضر لمن ليس له قرار صريح فقط — لا يمسّ غائباً/مستأذناً حدّده المعلّم */
export async function markAllPresent(halaqahId: number, date: string, recordedBy: number): Promise<number> {
  const rows = await db().sql`
    INSERT INTO attendance (halaqah_id, student_id, date, status, recorded_by, updated_at)
    SELECT s.teacher_id, s.id, ${date}::text, 'present', ${recordedBy}::int, now()
    FROM students s
    WHERE s.teacher_id = ${halaqahId} AND s.active AND s.deleted_at IS NULL
    ON CONFLICT (halaqah_id, student_id, date) DO NOTHING
    RETURNING student_id
  `;
  return rows.length;
}

/** ملخّصات آخر ٣٠ يوماً — لطالب واحد (studentId) أو لكل طلاب الحلقة غير المحذوفين */
export async function getAttendanceSummaries(
  halaqahId: number,
  today: string,
  studentId?: string,
): Promise<Record<string, AttendanceSummary>> {
  const since = daysBeforeISO(today, ATTENDANCE_SUMMARY_DAYS - 1);
  const only = studentId ?? null;
  const [students, stored, wards] = await Promise.all([
    db().sql`
      SELECT id FROM students
      WHERE teacher_id = ${halaqahId} AND deleted_at IS NULL AND (${only}::text IS NULL OR id = ${only})
    `,
    db().sql`
      SELECT student_id, date, status FROM attendance
      WHERE halaqah_id = ${halaqahId} AND date >= ${since} AND date <= ${today}
        AND (${only}::text IS NULL OR student_id = ${only})
    `,
    db().sql`
      SELECT DISTINCT student_id, date FROM ward_logs
      WHERE teacher_id = ${halaqahId} AND date >= ${since} AND date <= ${today}
        AND (${only}::text IS NULL OR student_id = ${only})
    `,
  ]);

  const storedBy = new Map<string, { date: string; status: AttendanceStatus }[]>();
  for (const r of stored) {
    const list = storedBy.get(r.student_id as string) ?? [];
    list.push({ date: r.date as string, status: r.status as AttendanceStatus });
    storedBy.set(r.student_id as string, list);
  }
  const wardsBy = new Map<string, string[]>();
  for (const r of wards) {
    const list = wardsBy.get(r.student_id as string) ?? [];
    list.push(r.date as string);
    wardsBy.set(r.student_id as string, list);
  }

  const result: Record<string, AttendanceSummary> = {};
  for (const s of students) {
    const id = s.id as string;
    result[id] = summarizeAttendance(storedBy.get(id) ?? [], wardsBy.get(id) ?? [], today);
  }
  return result;
}

export type QrCheckinResult =
  | { found: false }
  | { found: true; alreadyRecorded: boolean; status: AttendanceStatus };

/**
 * تسجيل حضور طالب بمسح الرمز — نفس جدول الحضور القائم. الإدراج بـ
 * ON CONFLICT DO NOTHING: لا يمسّ أبداً قراراً سبق تسجيله (يدوياً أو بمسح
 * سابق)، فالعملية متكررة الأمان (idempotent) ولا تطغى على قرار المعلّم.
 * شرط الطالب (بنفس الحلقة، فعّال، غير محذوف) داخل الاستعلام نفسه.
 * halaqahId/studentId من جلسة الطالب فقط.
 */
export async function recordQrCheckin(halaqahId: number, studentId: string, date: string): Promise<QrCheckinResult> {
  const inserted = await db().sql`
    INSERT INTO attendance (halaqah_id, student_id, date, status, checkin_source, recorded_by, updated_at)
    SELECT s.teacher_id, s.id, ${date}::text, 'present', 'qr', NULL, now()
    FROM students s
    WHERE s.teacher_id = ${halaqahId} AND s.id = ${studentId} AND s.active AND s.deleted_at IS NULL
    ON CONFLICT (halaqah_id, student_id, date) DO NOTHING
    RETURNING status
  `;
  if (inserted.length > 0) return { found: true, alreadyRecorded: false, status: "present" };

  const existing = await db().sql`
    SELECT a.status FROM attendance a
    JOIN students s ON s.teacher_id = a.halaqah_id AND s.id = a.student_id
    WHERE a.halaqah_id = ${halaqahId} AND a.student_id = ${studentId} AND a.date = ${date}
      AND s.active AND s.deleted_at IS NULL
  `;
  if (existing.length === 0) return { found: false };
  return { found: true, alreadyRecorded: true, status: existing[0].status as AttendanceStatus };
}
