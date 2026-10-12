import "server-only";

import { db } from "./db";
import {
  RECITATIONS_KEEP_PER_STUDENT,
  type RecitationMime,
  type RecitationRange,
  type RecitationStatus,
  type RecitationView,
} from "./recitations";

/*
  STEP 64 — الوصول لجدول recitations. halaqahId يطابق students.teacher_id.
  لا استعلام هنا يقبل معرّف حلقة/طالب من العميل — المسارات تمرّرهما من الجلسة.
  قوائم العرض لا تُرجع عمود audio أبداً (تُجلب بايتاته من getRecitationAudio فقط).
*/

function rowToView(row: Record<string, unknown>): RecitationView {
  return {
    id: Number(row.id),
    studentId: row.student_id as string,
    ...(row.student_name !== undefined ? { studentName: row.student_name as string } : {}),
    surah: Number(row.surah),
    fromAyah: Number(row.from_ayah),
    toAyah: Number(row.to_ayah),
    durationSec: Number(row.duration_sec),
    status: row.status as RecitationStatus,
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    teacherNote: (row.teacher_note as string | null) ?? null,
    createdAt: new Date(row.created_at as string | Date).toISOString(),
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string | Date).toISOString() : null,
  };
}

export type NewRecitation = {
  halaqahId: number;
  studentId: string;
  range: RecitationRange;
  mime: RecitationMime;
  durationSec: number;
  bytes: Buffer;
};

/**
 * يُدرج تلاوة ويقصّ ما زاد عن آخر ٥٠ لنفس الطالب في ترانزاكشن واحد — فشل
 * القصّ يلغي الإدراج (لا تتجاوز التلاوات الحدّ أبداً). يرجع معرّف التلاوة
 * الجديدة، أو null إن لم يكن الطالب موجوداً/فعّالاً (FK 23503).
 */
export async function insertRecitation(input: NewRecitation): Promise<number | null> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO recitations
         (halaqah_id, student_id, surah, from_ayah, to_ayah, mime, size_bytes, duration_sec, audio)
       SELECT s.teacher_id, s.id, $3, $4, $5, $6, $7, $8, $9
       FROM students s
       WHERE s.teacher_id = $1 AND s.id = $2 AND s.active AND s.deleted_at IS NULL
       RETURNING id`,
      [
        input.halaqahId,
        input.studentId,
        input.range.surah,
        input.range.fromAyah,
        input.range.toAyah,
        input.mime,
        input.bytes.length,
        input.durationSec,
        input.bytes,
      ],
    );
    if (inserted.rows.length === 0) {
      await client.query("ROLLBACK");
      return null;
    }
    // الاحتفاظ بآخر N: كل ما ليس ضمن أحدث N (بالتاريخ ثم المعرّف) يُحذف
    await client.query(
      `DELETE FROM recitations
       WHERE halaqah_id = $1 AND student_id = $2
         AND id NOT IN (
           SELECT id FROM recitations
           WHERE halaqah_id = $1 AND student_id = $2
           ORDER BY created_at DESC, id DESC
           LIMIT $3
         )`,
      [input.halaqahId, input.studentId, RECITATIONS_KEEP_PER_STUDENT],
    );
    await client.query("COMMIT");
    return Number(inserted.rows[0].id);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** تلاوات الطالب نفسه (الأحدث أولاً) */
export async function listStudentRecitations(halaqahId: number, studentId: string): Promise<RecitationView[]> {
  const rows = await db().sql`
    SELECT r.id, r.student_id, r.surah, r.from_ayah, r.to_ayah, r.duration_sec,
           r.status, r.score, r.teacher_note, r.created_at, r.reviewed_at
    FROM recitations r
    WHERE r.halaqah_id = ${halaqahId} AND r.student_id = ${studentId}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT ${RECITATIONS_KEEP_PER_STUDENT}
  `;
  return rows.map(rowToView);
}

/** تلاوات ابن ولي الأمر (آخر 20) — المستدعي تحقق من الربط مسبقاً */
export async function listChildRecitations(halaqahId: number, studentId: string): Promise<RecitationView[]> {
  const rows = await db().sql`
    SELECT r.id, r.student_id, r.surah, r.from_ayah, r.to_ayah, r.duration_sec,
           r.status, r.score, r.teacher_note, r.created_at, r.reviewed_at
    FROM recitations r
    WHERE r.halaqah_id = ${halaqahId} AND r.student_id = ${studentId}
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT 20
  `;
  return rows.map(rowToView);
}

/** تلاوات الحلقة لمعلّميها: المعلّقة أولاً (الأقدم أولاً)، ثم آخر المقيَّمة — طلاب غير محذوفين فقط */
export async function listHalaqahRecitations(halaqahId: number): Promise<RecitationView[]> {
  const [pending, reviewed] = await Promise.all([
    db().sql`
      SELECT r.id, r.student_id, s.name AS student_name, r.surah, r.from_ayah, r.to_ayah, r.duration_sec,
             r.status, r.score, r.teacher_note, r.created_at, r.reviewed_at
      FROM recitations r
      JOIN students s ON s.teacher_id = r.halaqah_id AND s.id = r.student_id
      WHERE r.halaqah_id = ${halaqahId} AND r.status = 'pending' AND s.deleted_at IS NULL
      ORDER BY r.created_at ASC, r.id ASC
      LIMIT 100
    `,
    db().sql`
      SELECT r.id, r.student_id, s.name AS student_name, r.surah, r.from_ayah, r.to_ayah, r.duration_sec,
             r.status, r.score, r.teacher_note, r.created_at, r.reviewed_at
      FROM recitations r
      JOIN students s ON s.teacher_id = r.halaqah_id AND s.id = r.student_id
      WHERE r.halaqah_id = ${halaqahId} AND r.status = 'reviewed' AND s.deleted_at IS NULL
      ORDER BY r.reviewed_at DESC NULLS LAST, r.id DESC
      LIMIT 30
    `,
  ]);
  return [...pending, ...reviewed].map(rowToView);
}

/** عدد التلاوات بانتظار التقييم — لوسم القائمة الجانبية */
export async function countPendingRecitations(halaqahId: number): Promise<number> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM recitations r
    JOIN students s ON s.teacher_id = r.halaqah_id AND s.id = r.student_id
    WHERE r.halaqah_id = ${halaqahId} AND r.status = 'pending' AND s.deleted_at IS NULL
  `;
  return Number(rows[0]?.n ?? 0);
}

export type ReviewResult = { found: false } | { found: true; studentId: string; wasPending: boolean };

/**
 * يحفظ تقييم المعلّم. الشرط (التلاوة بنفس الحلقة) داخل الاستعلام نفسه — تلاوة
 * حلقة أخرى ترجع found:false بلا كتابة. wasPending يميّز أول تقييم (يُشعَر
 * عنده فقط) عن تعديل لاحق.
 */
export async function reviewRecitation(
  halaqahId: number,
  recitationId: number,
  score: number,
  note: string | null,
  reviewedBy: number,
): Promise<ReviewResult> {
  const rows = await db().sql`
    WITH prev AS (
      SELECT id, status FROM recitations WHERE id = ${recitationId} AND halaqah_id = ${halaqahId}
    ), upd AS (
      UPDATE recitations SET
        status = 'reviewed', score = ${score}, teacher_note = ${note},
        reviewed_by = ${reviewedBy}, reviewed_at = now()
      WHERE id = ${recitationId} AND halaqah_id = ${halaqahId}
      RETURNING student_id
    )
    SELECT (SELECT student_id FROM upd) AS student_id, (SELECT status FROM prev) AS previous
  `;
  const row = rows[0];
  if (!row || !row.student_id) return { found: false };
  return { found: true, studentId: row.student_id as string, wasPending: row.previous === "pending" };
}

export type RecitationMeta = { id: number; halaqahId: number; studentId: string; mime: string; sizeBytes: number };

/** هوية التلاوة وملكيتها بلا البايتات — لفحص الصلاحية قبل جلب الصوت. طلاب محذوفون = غير موجودة */
export async function getRecitationMeta(id: number): Promise<RecitationMeta | null> {
  const rows = await db().sql`
    SELECT r.id, r.halaqah_id, r.student_id, r.mime, r.size_bytes
    FROM recitations r
    JOIN students s ON s.teacher_id = r.halaqah_id AND s.id = r.student_id
    WHERE r.id = ${id} AND s.deleted_at IS NULL
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    halaqahId: Number(row.halaqah_id),
    studentId: row.student_id as string,
    mime: row.mime as string,
    sizeBytes: Number(row.size_bytes),
  };
}

/** بايتات الصوت — تُستدعى بعد اجتياز فحص الصلاحية فقط */
export async function getRecitationAudio(id: number): Promise<Buffer | null> {
  const rows = await db().sql`SELECT audio FROM recitations WHERE id = ${id}`;
  return rows[0] ? (rows[0].audio as Buffer) : null;
}
