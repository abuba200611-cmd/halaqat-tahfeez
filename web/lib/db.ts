import "server-only";

import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { randomBytes } from "node:crypto";
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
  SQLite المدمج في Node — لا تبعيات native ولا خدمة خارجية.
  الوصول كله يمرّ من هنا، فيبقى الانتقال لقاعدة سحابية لاحقاً
  محصوراً في هذا الملف وحده.
*/

export type Teacher = {
  id: number;
  username: string;
  halaqahName: string;
};

function createDb(): DatabaseSync {
  const db = new DatabaseSync(path.join(process.cwd(), "halaqa.db"));

  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS teachers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE,
      password_hash TEXT    NOT NULL,
      halaqah_name  TEXT    NOT NULL DEFAULT 'حلقتي',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id          TEXT    NOT NULL,
      teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      group_name  TEXT    NOT NULL DEFAULT '',
      ranges      TEXT    NOT NULL DEFAULT '[]',
      mastery     TEXT    NOT NULL DEFAULT '{}',
      active      INTEGER NOT NULL DEFAULT 1,
      sort_order  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (teacher_id, id)
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      year        INTEGER NOT NULL,
      month       INTEGER NOT NULL,
      weekdays    TEXT    NOT NULL DEFAULT '[]',
      data        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE (teacher_id, year, month)
    );

    CREATE TABLE IF NOT EXISTS ward_logs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id   INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      student_id   TEXT    NOT NULL,
      date         TEXT    NOT NULL,
      hifz_from    INTEGER,
      hifz_to      INTEGER,
      review_from  INTEGER,
      review_to    INTEGER,
      note         TEXT    NOT NULL DEFAULT '',
      status       TEXT    NOT NULL DEFAULT 'new',
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (teacher_id, student_id)
        REFERENCES students(teacher_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      teacher_id  INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      endpoint    TEXT    NOT NULL UNIQUE,
      p256dh      TEXT    NOT NULL,
      auth        TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrateStudentAuth(db);
  return db;
}

/*
  قاعدة بيانات قديمة أُنشئت قبل نظام الطالب لا تملك عمودَي الدخول.
  CREATE TABLE IF NOT EXISTS لا يضيف أعمدة لجدول قائم، فنضيفها هنا،
  ونبني فهرساً فريداً على اسم المستخدم (للصفوف التي تملكه فقط).
*/
function migrateStudentAuth(database: DatabaseSync): void {
  const columns = database.prepare(`PRAGMA table_info(students)`).all() as { name: string }[];
  const names = new Set(columns.map((c) => c.name));
  if (!names.has("username")) database.exec(`ALTER TABLE students ADD COLUMN username TEXT`);
  if (!names.has("password_hash")) {
    database.exec(`ALTER TABLE students ADD COLUMN password_hash TEXT`);
  }
  database.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_students_username
       ON students(username) WHERE username IS NOT NULL`,
  );
}

/*
  إعادة تحميل الوحدات في التطوير تُنشئ اتصالاً جديداً في كل مرة،
  فنحتفظ بواحد على مستوى العملية.
*/
const globalForDb = globalThis as unknown as { halaqaDb?: DatabaseSync };
export const db: DatabaseSync = globalForDb.halaqaDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalForDb.halaqaDb = db;

/** سرّ توقيع الجلسات — من البيئة إن وُجد، وإلا يُولَّد مرة ويُحفظ */
export function sessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;

  const row = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'session_secret'`)
    .get() as { value: string } | undefined;
  if (row) return row.value;

  const generated = randomBytes(32).toString("hex");
  db.prepare(`INSERT INTO app_settings (key, value) VALUES ('session_secret', ?)`).run(generated);
  return generated;
}

// ————— المعلّمون —————

export function createTeacher(username: string, passwordHash: string, halaqahName: string): number {
  const info = db
    .prepare(`INSERT INTO teachers (username, password_hash, halaqah_name) VALUES (?, ?, ?)`)
    .run(username, passwordHash, halaqahName || "حلقتي");
  return Number(info.lastInsertRowid);
}

export function findTeacherByUsername(
  username: string,
): { id: number; username: string; passwordHash: string; halaqahName: string } | null {
  const row = db.prepare(`SELECT * FROM teachers WHERE username = ?`).get(username) as
    | { id: number; username: string; password_hash: string; halaqah_name: string }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    passwordHash: row.password_hash,
    halaqahName: row.halaqah_name,
  };
}

export function findTeacherById(id: number): Teacher | null {
  const row = db
    .prepare(`SELECT id, username, halaqah_name FROM teachers WHERE id = ?`)
    .get(id) as { id: number; username: string; halaqah_name: string } | undefined;
  return row ? { id: row.id, username: row.username, halaqahName: row.halaqah_name } : null;
}

// ————— الطلاب —————

type StudentRow = {
  id: string;
  name: string;
  group_name: string;
  ranges: string;
  mastery: string;
  active: number;
};

function rowToStudent(row: StudentRow): Student {
  return {
    id: row.id,
    name: row.name,
    group: row.group_name,
    ranges: JSON.parse(row.ranges) as MemorizedRange[],
    mastery: JSON.parse(row.mastery) as Record<number, number>,
    active: row.active === 1,
  };
}

export function listStudents(teacherId: number): Student[] {
  const rows = db
    .prepare(
      `SELECT id, name, group_name, ranges, mastery, active
       FROM students WHERE teacher_id = ? ORDER BY sort_order, name`,
    )
    .all(teacherId) as StudentRow[];
  return rows.map(rowToStudent);
}

export function upsertStudent(teacherId: number, student: Student, sortOrder = 0): void {
  db.prepare(
    `INSERT INTO students (id, teacher_id, name, group_name, ranges, mastery, active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(teacher_id, id) DO UPDATE SET
       name = excluded.name,
       group_name = excluded.group_name,
       ranges = excluded.ranges,
       mastery = excluded.mastery,
       active = excluded.active`,
  ).run(
    student.id,
    teacherId,
    student.name,
    student.group ?? "",
    JSON.stringify(student.ranges ?? []),
    JSON.stringify(student.mastery ?? {}),
    student.active ? 1 : 0,
    sortOrder,
  );
}

export function deleteStudent(teacherId: number, id: string): boolean {
  const info = db.prepare(`DELETE FROM students WHERE teacher_id = ? AND id = ?`).run(teacherId, id);
  return info.changes > 0;
}

/** يستبدل قائمة الطلاب كاملة — تُستخدم للحلقة التجريبية ولمسح البيانات */
export function replaceStudents(teacherId: number, students: Student[]): void {
  const run = db.prepare("BEGIN");
  run.run();
  try {
    db.prepare(`DELETE FROM students WHERE teacher_id = ?`).run(teacherId);
    students.forEach((student, index) => upsertStudent(teacherId, student, index));
    db.prepare("COMMIT").run();
  } catch (error) {
    db.prepare("ROLLBACK").run();
    throw error;
  }
}

// ————— الجداول الشهرية المحفوظة —————

type ScheduleRow = {
  id: number;
  year: number;
  month: number;
  weekdays: string;
  created_at: string;
};

function rowToScheduleInfo(row: ScheduleRow): SavedScheduleInfo {
  return {
    id: row.id,
    year: row.year,
    month: row.month,
    weekdays: JSON.parse(row.weekdays) as number[],
    createdAt: row.created_at,
  };
}

/** قائمة الجداول المحفوظة بلا محتواها — الأحدث اعتماداً أولاً */
export function listSchedules(teacherId: number): SavedScheduleInfo[] {
  const rows = db
    .prepare(
      `SELECT id, year, month, weekdays, created_at
       FROM schedules WHERE teacher_id = ?
       ORDER BY year DESC, month DESC`,
    )
    .all(teacherId) as ScheduleRow[];
  return rows.map(rowToScheduleInfo);
}

/** جدول محفوظ واحد بمحتواه، أو null إن لم يكن للمعلّم */
export function getSchedule(teacherId: number, id: number): SavedScheduleRecord | null {
  const row = db
    .prepare(
      `SELECT id, year, month, weekdays, data, created_at
       FROM schedules WHERE teacher_id = ? AND id = ?`,
    )
    .get(teacherId, id) as (ScheduleRow & { data: string }) | undefined;
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
export function saveSchedule(
  teacherId: number,
  year: number,
  month: number,
  weekdays: number[],
  schedule: SavedSchedule,
): SavedScheduleInfo {
  const row = db
    .prepare(
      `INSERT INTO schedules (teacher_id, year, month, weekdays, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(teacher_id, year, month) DO UPDATE SET
         weekdays = excluded.weekdays,
         data = excluded.data,
         created_at = datetime('now')
       RETURNING id, year, month, weekdays, created_at`,
    )
    .get(
      teacherId,
      year,
      month,
      JSON.stringify(weekdays),
      JSON.stringify(schedule),
    ) as ScheduleRow;
  return rowToScheduleInfo(row);
}

export function deleteSchedule(teacherId: number, id: number): boolean {
  const info = db
    .prepare(`DELETE FROM schedules WHERE teacher_id = ? AND id = ?`)
    .run(teacherId, id);
  return info.changes > 0;
}

// ————— حسابات الطلاب (دخول الطالب لنظامه) —————

/** يمنح الطالب اسم مستخدم وكلمة مرور، أو يحدّثهما. يرمي عند تكرار الاسم */
export function setStudentCredentials(
  teacherId: number,
  studentId: string,
  username: string,
  passwordHash: string,
): void {
  const exists = db
    .prepare(`SELECT 1 FROM students WHERE teacher_id = ? AND id = ?`)
    .get(teacherId, studentId);
  if (!exists) throw new Error("الطالب غير موجود");

  const taken = db
    .prepare(`SELECT 1 FROM students WHERE username = ? AND NOT (teacher_id = ? AND id = ?)`)
    .get(username, teacherId, studentId);
  if (taken) throw new Error("اسم المستخدم مستخدم من قبل");

  db.prepare(
    `UPDATE students SET username = ?, password_hash = ? WHERE teacher_id = ? AND id = ?`,
  ).run(username, passwordHash, teacherId, studentId);
}

/** اسم المستخدم لكل طالب (إن وُجد) — لعرضه في صفحة الطلاب عند المعلّم */
export function studentUsernames(teacherId: number): Record<string, string> {
  const rows = db
    .prepare(
      `SELECT id, username FROM students WHERE teacher_id = ? AND username IS NOT NULL`,
    )
    .all(teacherId) as { id: string; username: string }[];
  const out: Record<string, string> = {};
  for (const row of rows) out[row.id] = row.username;
  return out;
}

/** يجد الطالب باسم مستخدمه (فريد عالمياً) للتحقق عند الدخول */
export function findStudentByUsername(
  username: string,
): { teacherId: number; id: string; name: string; passwordHash: string } | null {
  const row = db
    .prepare(
      `SELECT teacher_id, id, name, password_hash
       FROM students WHERE username = ?`,
    )
    .get(username) as
    | { teacher_id: number; id: string; name: string; password_hash: string | null }
    | undefined;
  if (!row || !row.password_hash) return null;
  return { teacherId: row.teacher_id, id: row.id, name: row.name, passwordHash: row.password_hash };
}

/** هوية الطالب لجلسته: اسمه واسم حلقته — أو null إن حُذف أو أُلغي حسابه */
export function findStudentAccount(teacherId: number, studentId: string): StudentAccount | null {
  const row = db
    .prepare(
      `SELECT s.id, s.name, t.halaqah_name
       FROM students s JOIN teachers t ON t.id = s.teacher_id
       WHERE s.teacher_id = ? AND s.id = ?`,
    )
    .get(teacherId, studentId) as
    | { id: string; name: string; halaqah_name: string }
    | undefined;
  if (!row) return null;
  return { teacherId, id: row.id, name: row.name, halaqahName: row.halaqah_name };
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

type WardRow = {
  id: number;
  student_id: string;
  student_name: string;
  date: string;
  hifz_from: number | null;
  hifz_to: number | null;
  review_from: number | null;
  review_to: number | null;
  note: string;
  status: string;
  created_at: string;
};

function rowToWard(row: WardRow): WardLog {
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name,
    date: row.date,
    hifz: row.hifz_from !== null && row.hifz_to !== null
      ? { from: row.hifz_from, to: row.hifz_to }
      : null,
    review: row.review_from !== null && row.review_to !== null
      ? { from: row.review_from, to: row.review_to }
      : null,
    note: row.note,
    status: row.status as WardStatus,
    createdAt: row.created_at,
  };
}

export function createWardLog(teacherId: number, studentId: string, log: NewWardLog): number {
  const info = db
    .prepare(
      `INSERT INTO ward_logs
         (teacher_id, student_id, date, hifz_from, hifz_to, review_from, review_to, note, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
    )
    .run(
      teacherId,
      studentId,
      log.date,
      log.hifzFrom,
      log.hifzTo,
      log.reviewFrom,
      log.reviewTo,
      log.note,
    );
  return Number(info.lastInsertRowid);
}

const WARD_SELECT = `
  SELECT w.id, w.student_id, s.name AS student_name, w.date,
         w.hifz_from, w.hifz_to, w.review_from, w.review_to,
         w.note, w.status, w.created_at
  FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
`;

/** وارد المعلّم — كل الأوراد أو الجديدة فقط، الأحدث أولاً */
export function listWardLogs(teacherId: number, onlyNew = false): WardLog[] {
  const rows = db
    .prepare(
      `${WARD_SELECT}
       WHERE w.teacher_id = ?${onlyNew ? ` AND w.status = 'new'` : ""}
       ORDER BY w.created_at DESC, w.id DESC`,
    )
    .all(teacherId) as WardRow[];
  return rows.map(rowToWard);
}

/** أوراد طالب بعينه — لعرض سجلّه في صفحته */
export function listWardLogsForStudent(teacherId: number, studentId: string): WardLog[] {
  const rows = db
    .prepare(
      `${WARD_SELECT}
       WHERE w.teacher_id = ? AND w.student_id = ?
       ORDER BY w.created_at DESC, w.id DESC
       LIMIT 30`,
    )
    .all(teacherId, studentId) as WardRow[];
  return rows.map(rowToWard);
}

export function setWardLogStatus(teacherId: number, id: number, status: WardStatus): boolean {
  const info = db
    .prepare(`UPDATE ward_logs SET status = ? WHERE teacher_id = ? AND id = ?`)
    .run(status, teacherId, id);
  return info.changes > 0;
}

export function countNewWards(teacherId: number): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM ward_logs WHERE teacher_id = ? AND status = 'new'`)
    .get(teacherId) as { n: number };
  return row.n;
}

// ————— اشتراكات الإشعارات + مفاتيح VAPID —————

export function savePushSubscription(teacherId: number, sub: PushSubscriptionData): void {
  db.prepare(
    `INSERT INTO push_subscriptions (teacher_id, endpoint, p256dh, auth)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       teacher_id = excluded.teacher_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth`,
  ).run(teacherId, sub.endpoint, sub.p256dh, sub.auth);
}

export function listPushSubscriptions(teacherId: number): PushSubscriptionData[] {
  return db
    .prepare(
      `SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE teacher_id = ?`,
    )
    .all(teacherId) as PushSubscriptionData[];
}

export function deletePushSubscription(endpoint: string): void {
  db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
}

/** مفاتيح VAPID: من البيئة إن وُجدت، وإلا من الإعدادات — أو null قبل توليدها */
export function vapidKeys(): { publicKey: string; privateKey: string } | null {
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) return { publicKey: envPub, privateKey: envPriv };

  const rows = db
    .prepare(`SELECT key, value FROM app_settings WHERE key IN ('vapid_public', 'vapid_private')`)
    .all() as { key: string; value: string }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const pub = map.get("vapid_public");
  const priv = map.get("vapid_private");
  return pub && priv ? { publicKey: pub, privateKey: priv } : null;
}

/** يخزّن مفاتيح VAPID المولّدة مرة واحدة حتى تثبت عبر عمليات التشغيل */
export function setVapidKeys(publicKey: string, privateKey: string): void {
  const stmt = db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  );
  stmt.run("vapid_public", publicKey);
  stmt.run("vapid_private", privateKey);
}
