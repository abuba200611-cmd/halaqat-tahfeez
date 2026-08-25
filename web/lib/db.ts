import "server-only";

import { getDatabase } from "@netlify/database";
import { createHash, randomBytes } from "node:crypto";
import { juzesOfRange } from "./quran";
import type {
  MemorizedRange,
  PushSubscriptionData,
  Student,
  StudentAccount,
  WardLog,
  WardStatus,
} from "./types";
import type { SavedSchedule, SavedScheduleInfo, SavedScheduleRecord } from "./schedule";

/*
  نظام المعلّم — قاعدة بيانات Postgres (Netlify DB). المخطط في
  netlify/database/migrations/ يُطبَّق تلقائياً عند النشر. كل الوصول
  يمرّ من هنا، فيبقى أي تبديل لاحق محصوراً في هذا الملف وحده.
*/

export type TeacherRole = "supervisor" | "assistant";

export type Teacher = {
  id: number;
  username: string;
  teacherName: string;
  halaqahId: number;
  halaqahName: string;
  role: TeacherRole;
  emailVerified: boolean;
};

/*
  فتح كسول: getDatabase() يرمي خطأ فوراً لو لم يجد سلسلة اتصال، وهذا
  يحدث أثناء "جمع بيانات الصفحات" وقت next build محلياً (لا توجد بيئة
  Netlify حقيقية بعد). نؤجّل الإنشاء لأول استخدام فعلي داخل كل دالة.
*/
let dbInstance: ReturnType<typeof getDatabase> | null = null;
function db(): ReturnType<typeof getDatabase> {
  if (!dbInstance) dbInstance = getDatabase();
  return dbInstance;
}

/** سرّ توقيع الجلسات — من البيئة إن وُجد، وإلا يُولَّد مرة ويُحفظ */
export async function sessionSecret(): Promise<string> {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;

  const rows = await db().sql`SELECT value FROM app_settings WHERE key = 'session_secret'`;
  if (rows[0]) return rows[0].value as string;

  const generated = randomBytes(32).toString("hex");
  await db().sql`INSERT INTO app_settings (key, value) VALUES ('session_secret', ${generated})
    ON CONFLICT (key) DO NOTHING`;
  const after = await db().sql`SELECT value FROM app_settings WHERE key = 'session_secret'`;
  return (after[0]?.value as string) ?? generated;
}

// ————— الحلقات والمعلّمون —————
// حلقة واحدة قد يديرها أكثر من معلّم: مشرف واحد (أنشأ الحلقة) وأي عدد
// من المساعدين (انضمّوا برمز دعوة المعلّم)، بصلاحيات متطابقة تماماً —
// الدور للعرض فقط، لا يقيّد أي إجراء.

function rowToTeacherAccount(row: Record<string, unknown>): Teacher & { passwordHash: string } {
  return {
    id: row.id as number,
    username: row.username as string,
    passwordHash: row.password_hash as string,
    teacherName: (row.teacher_name as string) ?? "",
    halaqahId: row.halaqah_id as number,
    halaqahName: row.halaqah_name as string,
    role: (row.role as TeacherRole) ?? "supervisor",
    emailVerified: !!row.email_verified,
  };
}

/**
 * ينشئ حلقة جديدة وأول معلّم لها (مشرف) معاً — هذا هو مسار "أنشئ حلقة"
 * بشاشة التسجيل. يرجع معرّف حساب المعلّم الجديد.
 */
export async function createHalaqahWithSupervisor(
  username: string,
  passwordHash: string,
  halaqahName: string,
  emailVerified = false,
  teacherName = "",
): Promise<number> {
  const halaqahRows = await db().sql`
    INSERT INTO halaqahs (name) VALUES (${halaqahName || "حلقتي"}) RETURNING id
  `;
  const halaqahId = Number(halaqahRows[0].id);

  const rows = await db().sql`
    INSERT INTO teachers (username, password_hash, halaqah_id, role, teacher_name, email_verified, created_at)
    VALUES (${username}, ${passwordHash}, ${halaqahId}, 'supervisor', ${teacherName}, ${emailVerified}, ${new Date().toISOString()})
    RETURNING id
  `;
  return Number(rows[0].id);
}

/**
 * ينضم معلّم جديد (مساعد مشرف) لحلقة قائمة عبر رمز دعوة المعلّمين
 * الخاص بها (منفصل عن رمز دعوة الطلاب). يرجع null لو الرمز غير صحيح.
 */
export async function joinHalaqahAsAssistant(
  teacherInviteCode: string,
  username: string,
  passwordHash: string,
  emailVerified = false,
  teacherName = "",
): Promise<number | null> {
  const halaqahRows = await db().sql`SELECT id FROM halaqahs WHERE teacher_invite_code = ${teacherInviteCode}`;
  const halaqahId = halaqahRows[0]?.id as number | undefined;
  if (!halaqahId) return null;

  const rows = await db().sql`
    INSERT INTO teachers (username, password_hash, halaqah_id, role, teacher_name, email_verified, created_at)
    VALUES (${username}, ${passwordHash}, ${halaqahId}, 'assistant', ${teacherName}, ${emailVerified}, ${new Date().toISOString()})
    RETURNING id
  `;
  return Number(rows[0].id);
}

export async function findTeacherByUsername(
  username: string,
): Promise<(Teacher & { passwordHash: string }) | null> {
  const rows = await db().sql`
    SELECT t.id, t.username, t.password_hash, t.teacher_name, t.email_verified, t.role,
           h.id AS halaqah_id, h.name AS halaqah_name
    FROM teachers t JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE t.username = ${username}
  `;
  const row = rows[0];
  return row ? rowToTeacherAccount(row) : null;
}

/**
 * دخول جوجل: يجد معلّماً ببريده أو ينشئ له حلقة جديدة فوراً بكلمة مرور
 * عشوائية لن يستخدمها أبداً (دخوله دائماً عبر جوجل). البريد نفسه عمود
 * username. الاسم من ملف جوجل الشخصي يُخزَّن كاسم المعلّم مباشرة.
 */
export async function findOrCreateTeacherByEmail(email: string, name = ""): Promise<number> {
  const existing = await findTeacherByUsername(email);
  if (existing) return existing.id;

  const randomPasswordHash = randomBytes(32).toString("hex");
  // بريد جوجل موثّق من جوجل نفسها — نعتبره مؤكَّداً هنا فوراً
  return createHalaqahWithSupervisor(email, randomPasswordHash, "", true, name);
}

export async function findTeacherById(id: number): Promise<Teacher | null> {
  const rows = await db().sql`
    SELECT t.id, t.username, t.password_hash, t.teacher_name, t.email_verified, t.role,
           h.id AS halaqah_id, h.name AS halaqah_name
    FROM teachers t JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE t.id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  // نبني الكائن صراحةً بلا بصمة كلمة المرور — لا يجب أن تصل هذي القيمة
  // لأي واجهة عميل أبداً. rowToTeacherAccount ترجعها لأن
  // findTeacherByUsername يحتاجها داخلياً عند التحقق من الدخول.
  const { passwordHash, ...teacher } = rowToTeacherAccount(row);
  void passwordHash;
  return teacher;
}

// ————— اقتراحات تطوير من المعلّم (تصل للمطوّر فقط) —————

export type SuggestionType = "suggestion" | "problem";

export type Suggestion = {
  id: number;
  senderLabel: string;
  message: string;
  createdAt: string;
  type: SuggestionType;
  /** من أرسله — يُضاف عند دمج اقتراحات النظامين بلوحة المطوّر، اختياري هنا */
  source?: "teacher" | "student";
};

export async function addSuggestion(
  senderId: number,
  senderLabel: string,
  message: string,
  type: SuggestionType = "suggestion",
): Promise<void> {
  await db().sql`
    INSERT INTO suggestions (sender_id, sender_label, message, type, created_at)
    VALUES (${senderId}, ${senderLabel}, ${message}, ${type}, ${new Date().toISOString()})
  `;
}

export async function listSuggestions(): Promise<Suggestion[]> {
  const rows = await db().sql`
    SELECT id, sender_label, message, type, created_at FROM suggestions ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id as number,
    senderLabel: row.sender_label as string,
    message: row.message as string,
    createdAt: row.created_at as string,
    type: (row.type as SuggestionType) ?? "suggestion",
  }));
}

// ————— استرجاع كلمة المرور —————

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** يولّد رمزاً عشوائياً صالحاً ساعة واحدة، ويرجعه خاماً (يُرسَل بالبريد فقط) */
export async function createPasswordReset(teacherId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db().sql`
    INSERT INTO password_resets (teacher_id, token_hash, expires_at, created_at)
    VALUES (${teacherId}, ${hashToken(token)}, now() + interval '1 hour', ${new Date().toISOString()})
  `;
  return token;
}

/** يتحقق من الرمز ويحذفه فوراً (استخدام مرة واحدة) — يرجع معرّف المعلّم أو null */
export async function consumePasswordReset(token: string): Promise<number | null> {
  const rows = await db().sql`
    DELETE FROM password_resets
    WHERE token_hash = ${hashToken(token)} AND expires_at > now()
    RETURNING teacher_id
  `;
  return rows[0] ? Number(rows[0].teacher_id) : null;
}

export async function updateTeacherPassword(teacherId: number, passwordHash: string): Promise<void> {
  await db().sql`UPDATE teachers SET password_hash = ${passwordHash} WHERE id = ${teacherId}`;
}

// ————— تأكيد البريد الإلكتروني —————

/** يولّد رمز تأكيد صالح ٢٤ ساعة، ويرجعه خاماً (يُرسَل بالبريد فقط) */
export async function createEmailVerification(teacherId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db().sql`
    INSERT INTO email_verifications (teacher_id, token_hash, expires_at, created_at)
    VALUES (${teacherId}, ${hashToken(token)}, now() + interval '24 hours', ${new Date().toISOString()})
  `;
  return token;
}

/** يتحقق من الرمز ويعلّم البريد مؤكَّداً — يرجع معرّف المعلّم أو null */
export async function consumeEmailVerification(token: string): Promise<number | null> {
  const rows = await db().sql`
    DELETE FROM email_verifications
    WHERE token_hash = ${hashToken(token)} AND expires_at > now()
    RETURNING teacher_id
  `;
  const teacherId = rows[0] ? Number(rows[0].teacher_id) : null;
  if (teacherId) {
    await db().sql`UPDATE teachers SET email_verified = true WHERE id = ${teacherId}`;
  }
  return teacherId;
}

// ————— حماية التسجيل من الإساءة —————

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MINUTES = 60;

/**
 * يسجّل محاولة تسجيل جديدة من هذا العنوان، ويرجع true لو مسموح إتمامها
 * (أقل من REGISTER_LIMIT محاولة خلال الساعة الماضية من نفس العنوان).
 */
export async function checkRegisterRateLimit(ip: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM register_attempts
    WHERE ip = ${ip} AND created_at > now() - (${REGISTER_WINDOW_MINUTES} || ' minutes')::interval
  `;
  const count = Number(rows[0]?.n ?? 0);
  await db().sql`INSERT INTO register_attempts (ip) VALUES (${ip})`;
  return count < REGISTER_LIMIT;
}

// ————— الطلاب —————

function rowToStudent(row: Record<string, unknown>): Student {
  return {
    id: row.id as string,
    name: row.name as string,
    group: row.group_name as string,
    ranges: JSON.parse(row.ranges as string) as MemorizedRange[],
    mastery: JSON.parse(row.mastery as string) as Record<number, number>,
    active: row.active as boolean,
    rating: (row.rating as number | null) ?? 0,
  };
}

export async function listStudents(teacherId: number): Promise<Student[]> {
  const rows = await db().sql`
    SELECT id, name, group_name, ranges, mastery, active, rating
    FROM students WHERE teacher_id = ${teacherId} AND deleted_at IS NULL ORDER BY sort_order, name
  `;
  return rows.map(rowToStudent);
}

export async function upsertStudent(teacherId: number, student: Student, sortOrder = 0): Promise<void> {
  await db().sql`
    INSERT INTO students (id, teacher_id, name, group_name, ranges, mastery, active, rating, sort_order)
    VALUES (
      ${student.id}, ${teacherId}, ${student.name}, ${student.group ?? ""},
      ${JSON.stringify(student.ranges ?? [])}, ${JSON.stringify(student.mastery ?? {})},
      ${!!student.active}, ${student.rating ?? 0}, ${sortOrder}
    )
    ON CONFLICT (teacher_id, id) DO UPDATE SET
      name = excluded.name,
      group_name = excluded.group_name,
      ranges = excluded.ranges,
      mastery = excluded.mastery,
      active = excluded.active,
      rating = excluded.rating
  `;
}

/** يحدّث تقييم النجوم فقط دون المساس بباقي بيانات الطالب */
export async function setStudentRating(teacherId: number, studentId: string, rating: number): Promise<boolean> {
  const rows = await db().sql`
    UPDATE students SET rating = ${rating}
    WHERE teacher_id = ${teacherId} AND id = ${studentId}
    RETURNING id
  `;
  return rows.length > 0;
}

/** حذف ناعم — يبقى السطر ٢٤ ساعة قابلاً للاسترجاع بدل حذفه فوراً */
export async function deleteStudent(teacherId: number, id: string): Promise<boolean> {
  const rows = await db().sql`
    UPDATE students SET deleted_at = now()
    WHERE teacher_id = ${teacherId} AND id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export type DeletedStudent = { id: string; name: string; deletedAt: string };

/** الطلاب المحذوفون خلال آخر ٢٤ ساعة — لعرض شريط "تراجع" بصفحة الطلاب */
export async function listRecentlyDeletedStudents(teacherId: number): Promise<DeletedStudent[]> {
  const rows = await db().sql`
    SELECT id, name, deleted_at FROM students
    WHERE teacher_id = ${teacherId} AND deleted_at > now() - interval '24 hours'
    ORDER BY deleted_at DESC
  `;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, deletedAt: r.deleted_at as string }));
}

/** يسترجع طالباً محذوفاً خلال آخر ٢٤ ساعة — بعدها ما يقدر (مهلة انتهت) */
export async function restoreStudent(teacherId: number, id: string): Promise<boolean> {
  const rows = await db().sql`
    UPDATE students SET deleted_at = NULL
    WHERE teacher_id = ${teacherId} AND id = ${id}
      AND deleted_at IS NOT NULL AND deleted_at > now() - interval '24 hours'
    RETURNING id
  `;
  return rows.length > 0;
}

/** يستبدل قائمة الطلاب كاملة — تُستخدم للحلقة التجريبية ولمسح البيانات */
export async function replaceStudents(teacherId: number, students: Student[]): Promise<void> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM students WHERE teacher_id = $1", [teacherId]);
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      await client.query(
        `INSERT INTO students (id, teacher_id, name, group_name, ranges, mastery, active, rating, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          s.id,
          teacherId,
          s.name,
          s.group ?? "",
          JSON.stringify(s.ranges ?? []),
          JSON.stringify(s.mastery ?? {}),
          !!s.active,
          s.rating ?? 0,
          i,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ————— الجداول الشهرية المحفوظة —————

function rowToScheduleInfo(row: Record<string, unknown>): SavedScheduleInfo {
  return {
    id: row.id as number,
    year: row.year as number,
    month: row.month as number,
    weekdays: JSON.parse(row.weekdays as string) as number[],
    createdAt: row.created_at as string,
  };
}

/** قائمة الجداول المحفوظة بلا محتواها — الأحدث اعتماداً أولاً */
export async function listSchedules(teacherId: number): Promise<SavedScheduleInfo[]> {
  const rows = await db().sql`
    SELECT id, year, month, weekdays, created_at
    FROM schedules WHERE teacher_id = ${teacherId}
    ORDER BY year DESC, month DESC
  `;
  return rows.map(rowToScheduleInfo);
}

/** جدول محفوظ واحد بمحتواه، أو null إن لم يكن للمعلّم */
export async function getSchedule(teacherId: number, id: number): Promise<SavedScheduleRecord | null> {
  const rows = await db().sql`
    SELECT id, year, month, weekdays, data, created_at
    FROM schedules WHERE teacher_id = ${teacherId} AND id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    ...rowToScheduleInfo(row),
    schedule: JSON.parse(row.data) as SavedSchedule,
  };
}

/**
 * يحفظ جدول شهر، مستبدلاً أيّ جدول محفوظ للشهر نفسه (قيد فريد على
 * teacher_id + year + month). يرجع سطر القائمة الناتج.
 */
export async function saveSchedule(
  teacherId: number,
  year: number,
  month: number,
  weekdays: number[],
  schedule: SavedSchedule,
): Promise<SavedScheduleInfo> {
  const now = new Date().toISOString();
  const rows = await db().sql`
    INSERT INTO schedules (teacher_id, year, month, weekdays, data, created_at)
    VALUES (${teacherId}, ${year}, ${month}, ${JSON.stringify(weekdays)}, ${JSON.stringify(schedule)}, ${now})
    ON CONFLICT (teacher_id, year, month) DO UPDATE SET
      weekdays = excluded.weekdays,
      data = excluded.data,
      created_at = excluded.created_at
    RETURNING id, year, month, weekdays, created_at
  `;
  return rowToScheduleInfo(rows[0]);
}

export async function deleteSchedule(teacherId: number, id: number): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM schedules WHERE teacher_id = ${teacherId} AND id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

// ————— حسابات الطلاب (دخول الطالب لنظامه) —————

/** يمنح الطالب اسم مستخدم وكلمة مرور، أو يحدّثهما. يرمي عند تكرار الاسم */
export async function setStudentCredentials(
  teacherId: number,
  studentId: string,
  username: string,
  passwordHash: string,
): Promise<void> {
  const exists = await db().sql`
    SELECT 1 FROM students WHERE teacher_id = ${teacherId} AND id = ${studentId}
  `;
  if (exists.length === 0) throw new Error("الطالب غير موجود");

  const taken = await db().sql`
    SELECT 1 FROM students
    WHERE username = ${username} AND NOT (teacher_id = ${teacherId} AND id = ${studentId})
  `;
  if (taken.length > 0) throw new Error("اسم المستخدم مستخدم من قبل");

  await db().sql`
    UPDATE students SET username = ${username}, password_hash = ${passwordHash}
    WHERE teacher_id = ${teacherId} AND id = ${studentId}
  `;
}

/** اسم المستخدم لكل طالب (إن وُجد) — لعرضه في صفحة الطلاب عند المعلّم */
export async function studentUsernames(teacherId: number): Promise<Record<string, string>> {
  const rows = await db().sql`
    SELECT id, username FROM students WHERE teacher_id = ${teacherId} AND username IS NOT NULL
  `;
  const out: Record<string, string> = {};
  for (const row of rows) out[row.id as string] = row.username as string;
  return out;
}

/** يجد الطالب باسم مستخدمه (فريد عالمياً) للتحقق عند الدخول */
export async function findStudentByUsername(
  username: string,
): Promise<{ teacherId: number; id: string; name: string; passwordHash: string } | null> {
  const rows = await db().sql`
    SELECT teacher_id, id, name, password_hash FROM students
    WHERE username = ${username} AND deleted_at IS NULL
  `;
  const row = rows[0];
  if (!row || !row.password_hash) return null;
  return { teacherId: row.teacher_id, id: row.id, name: row.name, passwordHash: row.password_hash };
}

/**
 * هوية الطالب لجلسته: اسمه واسم حلقته — أو null إن حُذف أو أُلغي حسابه.
 * المعامل الأول هنا معرّف الحلقة (halaqah_id) — students.teacher_id
 * يحمل قيمة الحلقة منذ إضافة تعدّد المعلّمين، رغم بقاء اسم العمود.
 */
export async function findStudentAccount(
  halaqahId: number,
  studentId: string,
): Promise<StudentAccount | null> {
  const rows = await db().sql`
    SELECT s.id, s.name, h.name AS halaqah_name
    FROM students s JOIN halaqahs h ON h.id = s.teacher_id
    WHERE s.teacher_id = ${halaqahId} AND s.id = ${studentId} AND s.deleted_at IS NULL
  `;
  const row = rows[0];
  if (!row) return null;
  return { teacherId: halaqahId, id: row.id, name: row.name, halaqahName: row.halaqah_name };
}

// ————— سجلّات الورد اليومي —————

export type NewWardLog = {
  date: string;
  hifzFrom: number | null;
  hifzTo: number | null;
  reviewFrom: number | null;
  reviewTo: number | null;
  note: string;
};

function rowToWard(row: Record<string, unknown>): WardLog {
  const hifzFrom = row.hifz_from as number | null;
  const hifzTo = row.hifz_to as number | null;
  const reviewFrom = row.review_from as number | null;
  const reviewTo = row.review_to as number | null;
  return {
    id: row.id as number,
    studentId: row.student_id as string,
    studentName: row.student_name as string,
    date: row.date as string,
    hifz: hifzFrom !== null && hifzTo !== null ? { from: hifzFrom, to: hifzTo } : null,
    review: reviewFrom !== null && reviewTo !== null ? { from: reviewFrom, to: reviewTo } : null,
    note: row.note as string,
    status: row.status as WardStatus,
    createdAt: row.created_at as string,
  };
}

export async function createWardLog(
  teacherId: number,
  studentId: string,
  log: NewWardLog,
): Promise<number> {
  const rows = await db().sql`
    INSERT INTO ward_logs
      (teacher_id, student_id, date, hifz_from, hifz_to, review_from, review_to, note, status, created_at)
    VALUES (
      ${teacherId}, ${studentId}, ${log.date}, ${log.hifzFrom}, ${log.hifzTo},
      ${log.reviewFrom}, ${log.reviewTo}, ${log.note}, 'new', ${new Date().toISOString()}
    )
    RETURNING id
  `;
  return Number(rows[0].id);
}

/** وارد المعلّم — كل الأوراد أو الجديدة فقط، الأحدث أولاً */
export async function listWardLogs(teacherId: number, onlyNew = false): Promise<WardLog[]> {
  const rows = onlyNew
    ? await db().sql`
        SELECT w.id, w.student_id, s.name AS student_name, w.date,
               w.hifz_from, w.hifz_to, w.review_from, w.review_to,
               w.note, w.status, w.created_at
        FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
        WHERE w.teacher_id = ${teacherId} AND w.status = 'new'
        ORDER BY w.created_at DESC, w.id DESC
      `
    : await db().sql`
        SELECT w.id, w.student_id, s.name AS student_name, w.date,
               w.hifz_from, w.hifz_to, w.review_from, w.review_to,
               w.note, w.status, w.created_at
        FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
        WHERE w.teacher_id = ${teacherId}
        ORDER BY w.created_at DESC, w.id DESC
      `;
  return rows.map(rowToWard);
}

/** أوراد طالب بعينه — لعرض سجلّه في صفحته */
export async function listWardLogsForStudent(teacherId: number, studentId: string): Promise<WardLog[]> {
  const rows = await db().sql`
    SELECT w.id, w.student_id, s.name AS student_name, w.date,
           w.hifz_from, w.hifz_to, w.review_from, w.review_to,
           w.note, w.status, w.created_at
    FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
    WHERE w.teacher_id = ${teacherId} AND w.student_id = ${studentId}
    ORDER BY w.created_at DESC, w.id DESC
    LIMIT 30
  `;
  return rows.map(rowToWard);
}

export async function setWardLogStatus(teacherId: number, id: number, status: WardStatus): Promise<boolean> {
  const rows = await db().sql`
    UPDATE ward_logs SET status = ${status}
    WHERE teacher_id = ${teacherId} AND id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function countNewWards(teacherId: number): Promise<number> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM ward_logs WHERE teacher_id = ${teacherId} AND status = 'new'
  `;
  return Number(rows[0].n);
}

// ————— اشتراكات الإشعارات + مفاتيح VAPID —————

export async function savePushSubscription(teacherId: number, sub: PushSubscriptionData): Promise<void> {
  await db().sql`
    INSERT INTO push_subscriptions (teacher_id, endpoint, p256dh, auth, created_at)
    VALUES (${teacherId}, ${sub.endpoint}, ${sub.p256dh}, ${sub.auth}, ${new Date().toISOString()})
    ON CONFLICT (endpoint) DO UPDATE SET
      teacher_id = excluded.teacher_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth
  `;
}

export async function listPushSubscriptions(teacherId: number): Promise<PushSubscriptionData[]> {
  const rows = await db().sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE teacher_id = ${teacherId}
  `;
  return rows.map((r) => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await db().sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}

/** مفاتيح VAPID: من البيئة إن وُجدت، وإلا من الإعدادات — أو null قبل توليدها */
export async function vapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) return { publicKey: envPub, privateKey: envPriv };

  const rows = await db().sql`
    SELECT key, value FROM app_settings WHERE key IN ('vapid_public', 'vapid_private')
  `;
  const map = new Map(rows.map((r) => [r.key as string, r.value as string]));
  const pub = map.get("vapid_public");
  const priv = map.get("vapid_private");
  return pub && priv ? { publicKey: pub, privateKey: priv } : null;
}

/** يخزّن مفاتيح VAPID المولّدة مرة واحدة حتى تثبت عبر عمليات التشغيل */
export async function setVapidKeys(publicKey: string, privateKey: string): Promise<void> {
  await db().sql`
    INSERT INTO app_settings (key, value) VALUES ('vapid_public', ${publicKey})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `;
  await db().sql`
    INSERT INTO app_settings (key, value) VALUES ('vapid_private', ${privateKey})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `;
}

// ————— ربط بنظام تسجيل الورد المستقل (tasjeel-tullab) —————

export async function getStudentById(teacherId: number, id: string): Promise<Student | null> {
  const rows = await db().sql`
    SELECT id, name, group_name, ranges, mastery, active, rating
    FROM students WHERE teacher_id = ${teacherId} AND id = ${id}
  `;
  const row = rows[0];
  return row ? rowToStudent(row) : null;
}

/** خريطة معرّف الطالب ← اسم مستخدمه المربوط، لعرضها دفعة واحدة في صفحة الطلاب */
export async function listStudentLinks(teacherId: number): Promise<Record<string, string>> {
  const rows = await db().sql`
    SELECT student_id, link_username FROM student_links WHERE teacher_id = ${teacherId}
  `;
  const out: Record<string, string> = {};
  for (const row of rows) out[row.student_id as string] = row.link_username as string;
  return out;
}

/** خريطة معرّف الطالب ← وصف آخر سحب، لعرضها بجانب اسم المستخدم المربوط */
export async function listStudentLinkSummaries(teacherId: number): Promise<Record<string, string>> {
  const rows = await db().sql`
    SELECT student_id, last_summary FROM student_links
    WHERE teacher_id = ${teacherId} AND last_summary IS NOT NULL
  `;
  const out: Record<string, string> = {};
  for (const row of rows) out[row.student_id as string] = row.last_summary as string;
  return out;
}

export async function getStudentLink(
  teacherId: number,
  studentId: string,
): Promise<{ linkUsername: string; lastPulledAt: string | null; lastSummary: string | null } | null> {
  const rows = await db().sql`
    SELECT link_username, last_pulled_at, last_summary
    FROM student_links WHERE teacher_id = ${teacherId} AND student_id = ${studentId}
  `;
  const row = rows[0];
  return row
    ? { linkUsername: row.link_username, lastPulledAt: row.last_pulled_at, lastSummary: row.last_summary }
    : null;
}

/** يبحث عن الطالب المرتبط باسم مستخدم tasjeel-tullab هذا — لإشعار المعلّم عند ورد جديد */
export async function findLinkByUsername(
  linkUsername: string,
): Promise<{ teacherId: number; studentId: string; studentName: string } | null> {
  const rows = await db().sql`
    SELECT sl.teacher_id, sl.student_id, s.name
    FROM student_links sl JOIN students s ON s.teacher_id = sl.teacher_id AND s.id = sl.student_id
    WHERE sl.link_username = ${linkUsername}
  `;
  const row = rows[0];
  return row ? { teacherId: row.teacher_id, studentId: row.student_id, studentName: row.name } : null;
}

export async function saveStudentLink(
  teacherId: number,
  studentId: string,
  linkUsername: string,
  summaryLabel: string | null,
): Promise<void> {
  await db().sql`
    INSERT INTO student_links (teacher_id, student_id, link_username, last_pulled_at, last_summary)
    VALUES (${teacherId}, ${studentId}, ${linkUsername}, ${new Date().toISOString()}, ${summaryLabel})
    ON CONFLICT (teacher_id, student_id) DO UPDATE SET
      link_username = excluded.link_username,
      last_pulled_at = excluded.last_pulled_at,
      last_summary = excluded.last_summary
  `;
}

// ————— رابط دعوة الحلقة (انضمام ذاتي للطلاب، وانضمام معلّم زميل) —————

/**
 * رمز دعوة الطلاب — يُولَّد كسولاً (أول طلب فقط) ويبقى ثابتاً بعدها.
 * الطالب يفتح رابطاً فيه هذا الرمز فينضم مباشرة لهذي الحلقة بلا أي
 * تدخّل يدوي (لا إضافة الطالب يدوياً، ولا تبادل اسم مستخدم للربط).
 */
export async function halaqahInviteCode(halaqahId: number): Promise<string> {
  const existing = await db().sql`SELECT invite_code FROM halaqahs WHERE id = ${halaqahId}`;
  const current = existing[0]?.invite_code as string | null | undefined;
  if (current) return current;

  const generated = randomBytes(5).toString("hex");
  await db().sql`
    UPDATE halaqahs SET invite_code = ${generated} WHERE id = ${halaqahId} AND invite_code IS NULL
  `;
  const after = await db().sql`SELECT invite_code FROM halaqahs WHERE id = ${halaqahId}`;
  return (after[0]?.invite_code as string) ?? generated;
}

/**
 * رمز دعوة معلّم زميل — منفصل تماماً عن رمز دعوة الطلاب أعلاه. من يفتح
 * رابطه وينشئ حساباً ينضم كـ"مساعد مشرف" لهذي الحلقة بصلاحيات كاملة.
 */
export async function halaqahTeacherInviteCode(halaqahId: number): Promise<string> {
  const existing = await db().sql`SELECT teacher_invite_code FROM halaqahs WHERE id = ${halaqahId}`;
  const current = existing[0]?.teacher_invite_code as string | null | undefined;
  if (current) return current;

  const generated = randomBytes(5).toString("hex");
  await db().sql`
    UPDATE halaqahs SET teacher_invite_code = ${generated}
    WHERE id = ${halaqahId} AND teacher_invite_code IS NULL
  `;
  const after = await db().sql`SELECT teacher_invite_code FROM halaqahs WHERE id = ${halaqahId}`;
  return (after[0]?.teacher_invite_code as string) ?? generated;
}

/** أعضاء فريق الحلقة (مشرف + مساعدون) — لعرضهم بصفحة إعدادات الحلقة */
export async function listHalaqahTeachers(
  halaqahId: number,
): Promise<{ id: number; teacherName: string; username: string; role: TeacherRole }[]> {
  const rows = await db().sql`
    SELECT id, teacher_name, username, role FROM teachers
    WHERE halaqah_id = ${halaqahId} ORDER BY (role = 'supervisor') DESC, created_at
  `;
  return rows.map((r) => ({
    id: r.id as number,
    teacherName: (r.teacher_name as string) || (r.username as string),
    username: r.username as string,
    role: (r.role as TeacherRole) ?? "assistant",
  }));
}

export async function findHalaqahByInviteCode(
  code: string,
): Promise<{ id: number; teacherName: string; halaqahName: string } | null> {
  const rows = await db().sql`
    SELECT h.id, h.name AS halaqah_name,
           string_agg(t.teacher_name, '، ' ORDER BY (t.role = 'supervisor') DESC) AS teacher_names
    FROM halaqahs h LEFT JOIN teachers t ON t.halaqah_id = h.id AND t.teacher_name != ''
    WHERE h.invite_code = ${code}
    GROUP BY h.id, h.name
  `;
  const row = rows[0];
  return row ? { id: row.id, teacherName: (row.teacher_names as string) ?? "", halaqahName: row.halaqah_name } : null;
}

/**
 * يضيف طالباً لقائمة الحلقة صاحبة رمز الدعوة بلا أي ربط بحساب تسجيل ورد
 * (يُستخدم من نظام إدارة الجامع — الطالب سجّل بياناته بالجامع فقط، ما
 * فتح حساباً بنظام تسجيل الورد بعد). يرجع null لو الرمز غير صحيح.
 */
export async function addStudentByInviteCode(
  inviteCode: string,
  studentName: string,
): Promise<{ teacherId: number; studentId: string } | null> {
  const halaqah = await findHalaqahByInviteCode(inviteCode);
  if (!halaqah) return null;

  const studentId = randomBytes(12).toString("hex");
  await upsertStudent(halaqah.id, {
    id: studentId,
    name: studentName,
    group: "",
    ranges: [],
    mastery: {},
    active: true,
    rating: 0,
  });
  return { teacherId: halaqah.id, studentId };
}

/**
 * ينشئ طالباً جديداً بالحلقة صاحبة رمز الدعوة، ويربطه فوراً باسم مستخدمه
 * بنظام تسجيل الورد — يغني عن خطوتي "إضافة طالب" و"ربط" اليدويتين.
 * يرجع null لو الرمز غير صحيح، فلا يفشل تسجيل الطالب نفسه بأي حال.
 */
export async function joinHalaqahByInviteCode(
  inviteCode: string,
  studentName: string,
  linkUsername: string,
): Promise<{ teacherId: number; studentId: string } | null> {
  const halaqah = await findHalaqahByInviteCode(inviteCode);
  if (!halaqah) return null;

  const studentId = randomBytes(12).toString("hex");
  await upsertStudent(halaqah.id, {
    id: studentId,
    name: studentName,
    group: "",
    ranges: [],
    mastery: {},
    active: true,
    rating: 0,
  });
  await saveStudentLink(halaqah.id, studentId, linkUsername, null);
  return { teacherId: halaqah.id, studentId };
}

/** يدمج نطاقاً جديداً مع القائمة، مذيباً كل ما يتداخل أو يتلاصق معه بدل تكديسه */
function mergeRangeIntoList(
  ranges: MemorizedRange[],
  incoming: { from: number; to: number },
): MemorizedRange[] {
  let from = incoming.from;
  let to = incoming.to;
  const rest: MemorizedRange[] = [];

  for (const r of ranges) {
    if (r.from <= to + 1 && r.to >= from - 1) {
      from = Math.min(from, r.from);
      to = Math.max(to, r.to);
    } else {
      rest.push(r);
    }
  }

  rest.push({ from, to, monthsAgo: 0 });
  return rest.sort((a, b) => a.from - b.from);
}

/** يرفع إتقان الأجزاء التي تقع ضمن نطاق رُوجع مؤخراً، دون خفض إتقان أعلى موجود */
function bumpMasteryForRange(
  mastery: Record<number, number>,
  range: { from: number; to: number },
): Record<number, number> {
  const next = { ...mastery };
  for (const juz of juzesOfRange(range.from, range.to)) {
    next[juz] = Math.min(100, Math.max(next[juz] ?? 40, 75));
  }
  return next;
}

/**
 * يدمج ملخّصاً من نظام تسجيل الورد في بيانات الطالب: يوسّع ranges بنطاق
 * الحفظ الجديد، ويرفع إتقان الأجزاء التي راجعها مؤخراً. لا يمسّ شيئاً
 * غير هذين — الاسم والمجموعة والحالة تبقى كما أدخلها المعلّم.
 */
export async function applyLinkSummary(
  teacherId: number,
  studentId: string,
  summary: {
    latestHifz: { from: number; to: number } | null;
    latestReview: { from: number; to: number } | null;
  },
): Promise<Student | null> {
  const student = await getStudentById(teacherId, studentId);
  if (!student) return null;

  const ranges = summary.latestHifz
    ? mergeRangeIntoList(student.ranges, summary.latestHifz)
    : student.ranges;
  const mastery = summary.latestReview
    ? bumpMasteryForRange(student.mastery, summary.latestReview)
    : student.mastery;

  const updated: Student = { ...student, ranges, mastery };
  await upsertStudent(teacherId, updated);
  return updated;
}
