import "server-only";

import { db } from "./db";

/*
  بيانات /api/v1 للقراءة. كل استعلام يمرّ عبر halaqahs.mosque_id = $جامع-المفتاح
  فلا صف من جامع آخر يخرج أبداً. الحقول مقتصرة على الضروري: لا أسماء مستخدمين
  ولا كلمات مرور ولا هواتف ولا ملاحظات نصية حرّة ولا أسماء معلّمين. الترقيم
  keyset (مؤشر = آخر مفتاح) مع limit+1 لمعرفة وجود صفحة تالية. teacher_id في
  جداول الطلاب هو معرّف الحلقة (halaqahs.id).
*/

export type Page<T> = { rows: T[]; hasMore: boolean };

function page<T>(rows: T[], limit: number): Page<T> {
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

export type ApiHalaqah = { id: number; name: string; created_at: string };

export async function listHalaqatV1(mosqueId: number, limit: number, afterId: number): Promise<Page<ApiHalaqah>> {
  const rows = await db().sql`
    SELECT id, name, created_at FROM halaqahs
    WHERE mosque_id = ${mosqueId} AND id > ${afterId}
    ORDER BY id LIMIT ${limit + 1}
  `;
  return page(
    rows.map((r) => ({ id: Number(r.id), name: r.name as string, created_at: new Date(String(r.created_at)).toISOString() })),
    limit,
  );
}

export type ApiStudent = { id: string; halaqah_id: number; name: string; active: boolean };

export async function listStudentsV1(
  mosqueId: number,
  limit: number,
  after: { halaqahId: number; studentId: string },
): Promise<Page<ApiStudent>> {
  const rows = await db().sql`
    SELECT s.id, s.teacher_id, s.name, s.active
    FROM students s JOIN halaqahs h ON h.id = s.teacher_id
    WHERE h.mosque_id = ${mosqueId} AND s.deleted_at IS NULL
      AND (s.teacher_id, s.id) > (${after.halaqahId}::int, ${after.studentId}::text)
    ORDER BY s.teacher_id, s.id LIMIT ${limit + 1}
  `;
  return page(
    rows.map((r) => ({
      id: r.id as string,
      halaqah_id: Number(r.teacher_id),
      name: r.name as string,
      active: r.active === true,
    })),
    limit,
  );
}

export type Filters = { from: string | null; to: string | null; halaqahId: number | null };

export type ApiAttendance = { halaqah_id: number; student_id: string; date: string; status: string };

export async function listAttendanceV1(
  mosqueId: number,
  limit: number,
  after: { halaqahId: number; studentId: string; date: string },
  f: Filters,
): Promise<Page<ApiAttendance>> {
  const rows = await db().sql`
    SELECT a.halaqah_id, a.student_id, a.date, a.status
    FROM attendance a JOIN halaqahs h ON h.id = a.halaqah_id
    WHERE h.mosque_id = ${mosqueId}
      AND (a.halaqah_id, a.student_id, a.date) > (${after.halaqahId}::int, ${after.studentId}::text, ${after.date}::text)
      AND (${f.from}::text IS NULL OR a.date >= ${f.from}::text)
      AND (${f.to}::text IS NULL OR a.date <= ${f.to}::text)
      AND (${f.halaqahId}::int IS NULL OR a.halaqah_id = ${f.halaqahId}::int)
    ORDER BY a.halaqah_id, a.student_id, a.date LIMIT ${limit + 1}
  `;
  return page(
    rows.map((r) => ({
      halaqah_id: Number(r.halaqah_id),
      student_id: r.student_id as string,
      date: r.date as string,
      status: r.status as string,
    })),
    limit,
  );
}

const nullableInt = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export type ApiProgress = {
  id: number;
  halaqah_id: number;
  student_id: string;
  date: string;
  status: string;
  hifz: { from_surah: number | null; from_ayah: number | null; to_surah: number | null; to_ayah: number | null };
  review: { from_surah: number | null; from_ayah: number | null; to_surah: number | null; to_ayah: number | null };
};

export async function listProgressV1(
  mosqueId: number,
  limit: number,
  afterId: number,
  f: Filters,
): Promise<Page<ApiProgress>> {
  const rows = await db().sql`
    SELECT w.id, w.teacher_id, w.student_id, w.date, w.status,
           w.hifz_from_surah, w.hifz_from_ayah, w.hifz_to_surah, w.hifz_to_ayah,
           w.review_from_surah, w.review_from_ayah, w.review_to_surah, w.review_to_ayah
    FROM ward_logs w JOIN halaqahs h ON h.id = w.teacher_id
    WHERE h.mosque_id = ${mosqueId} AND w.id > ${afterId}
      AND (${f.from}::text IS NULL OR w.date >= ${f.from}::text)
      AND (${f.to}::text IS NULL OR w.date <= ${f.to}::text)
      AND (${f.halaqahId}::int IS NULL OR w.teacher_id = ${f.halaqahId}::int)
    ORDER BY w.id LIMIT ${limit + 1}
  `;
  return page(
    rows.map((r) => ({
      id: Number(r.id),
      halaqah_id: Number(r.teacher_id),
      student_id: r.student_id as string,
      date: r.date as string,
      status: r.status as string,
      hifz: {
        from_surah: nullableInt(r.hifz_from_surah),
        from_ayah: nullableInt(r.hifz_from_ayah),
        to_surah: nullableInt(r.hifz_to_surah),
        to_ayah: nullableInt(r.hifz_to_ayah),
      },
      review: {
        from_surah: nullableInt(r.review_from_surah),
        from_ayah: nullableInt(r.review_from_ayah),
        to_surah: nullableInt(r.review_to_surah),
        to_ayah: nullableInt(r.review_to_ayah),
      },
    })),
    limit,
  );
}

// ————— تصدير CSV لمدير الجامع (بأسماء، سقف ٥٠ ألف صف) —————

export const EXPORT_MAX_ROWS = 50000;

export async function exportStudentsRows(mosqueId: number): Promise<(string | number | boolean)[][]> {
  const rows = await db().sql`
    SELECT s.id, s.name, h.name AS halaqah_name, s.active
    FROM students s JOIN halaqahs h ON h.id = s.teacher_id
    WHERE h.mosque_id = ${mosqueId} AND s.deleted_at IS NULL
    ORDER BY h.name, s.sort_order, s.name LIMIT ${EXPORT_MAX_ROWS}
  `;
  return rows.map((r) => [r.id as string, r.name as string, r.halaqah_name as string, r.active === true ? "نعم" : "لا"]);
}

export async function exportAttendanceRows(mosqueId: number): Promise<(string | number)[][]> {
  const rows = await db().sql`
    SELECT a.date, h.name AS halaqah_name, s.name AS student_name, a.status
    FROM attendance a
    JOIN halaqahs h ON h.id = a.halaqah_id
    JOIN students s ON s.teacher_id = a.halaqah_id AND s.id = a.student_id
    WHERE h.mosque_id = ${mosqueId}
    ORDER BY a.date DESC, h.name, s.name LIMIT ${EXPORT_MAX_ROWS}
  `;
  return rows.map((r) => [r.date as string, r.halaqah_name as string, r.student_name as string, r.status as string]);
}

export async function exportProgressRows(mosqueId: number): Promise<(string | number)[][]> {
  const rows = await db().sql`
    SELECT w.date, h.name AS halaqah_name, s.name AS student_name, w.status,
           w.hifz_from_surah, w.hifz_from_ayah, w.hifz_to_surah, w.hifz_to_ayah,
           w.review_from_surah, w.review_from_ayah, w.review_to_surah, w.review_to_ayah
    FROM ward_logs w
    JOIN halaqahs h ON h.id = w.teacher_id
    JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
    WHERE h.mosque_id = ${mosqueId}
    ORDER BY w.date DESC, h.name, s.name LIMIT ${EXPORT_MAX_ROWS}
  `;
  const pos = (surah: unknown, ayah: unknown) => (surah == null ? "" : `${surah}:${ayah ?? ""}`);
  return rows.map((r) => [
    r.date as string,
    r.halaqah_name as string,
    r.student_name as string,
    r.status as string,
    pos(r.hifz_from_surah, r.hifz_from_ayah),
    pos(r.hifz_to_surah, r.hifz_to_ayah),
    pos(r.review_from_surah, r.review_from_ayah),
    pos(r.review_to_surah, r.review_to_ayah),
  ]);
}
