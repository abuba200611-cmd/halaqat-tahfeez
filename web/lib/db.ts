import "server-only";

import { getDatabase } from "@netlify/database";
import { createHash, randomBytes } from "node:crypto";
import { ensureStudentIdentity, ensureTeacherIdentity } from "./identity";
import type { ProcessedImage } from "./image-processing";
import { juzesOfRange } from "./quran";
import type {
  AyahRange,
  BuddyRequest,
  HalaqahMate,
  MemorizedRange,
  PushSubscriptionData,
  ReviewTrack,
  Student,
  StudentAccount,
  WardLog,
  WardReviewBuddy,
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
  sessionVersion: number;
  /** وقت إيقاف الحساب من مشرف الحلقة — null طالما الحساب فعّال (STEP 60) */
  deactivatedAt: string | null;
};

/*
  فتح كسول: getDatabase() يرمي خطأ فوراً لو لم يجد سلسلة اتصال، وهذا
  يحدث أثناء "جمع بيانات الصفحات" وقت next build محلياً (لا توجد بيئة
  Netlify حقيقية بعد). نؤجّل الإنشاء لأول استخدام فعلي داخل كل دالة.
*/
let dbInstance: ReturnType<typeof getDatabase> | null = null;
export function db(): ReturnType<typeof getDatabase> {
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
    sessionVersion: Number(row.session_version ?? 0),
    deactivatedAt: (row.deactivated_at as string | null) ?? null,
  };
}

/**
 * ينشئ حلقة جديدة وأول معلّم لها (مشرف) معاً — هذا هو مسار "أنشئ حلقة"
 * بشاشة التسجيل. يرجع معرّف حساب المعلّم الجديد. ترانزاكشن واحدة تشمل
 * هوية M5 (user+membership) فلا يوجد معلّم بلا هوية موحّدة إلا لو فشل
 * إنشاؤه كله.
 */
export async function createHalaqahWithSupervisor(
  username: string,
  passwordHash: string,
  halaqahName: string,
  emailVerified = false,
  teacherName = "",
): Promise<number> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const halaqahRows = await client.query(`INSERT INTO halaqahs (name) VALUES ($1) RETURNING id`, [
      halaqahName || "حلقتي",
    ]);
    const halaqahId = Number(halaqahRows.rows[0].id);

    const rows = await client.query(
      `INSERT INTO teachers (username, password_hash, halaqah_id, role, teacher_name, email_verified, created_at)
       VALUES ($1, $2, $3, 'supervisor', $4, $5, $6) RETURNING id`,
      [username, passwordHash, halaqahId, teacherName, emailVerified, new Date().toISOString()],
    );
    const teacherId = Number(rows.rows[0].id);
    await ensureTeacherIdentity(client, {
      id: teacherId,
      username,
      teacherName,
      halaqahId,
      role: "supervisor",
    });
    await client.query("COMMIT");
    return teacherId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * ينضم معلّم جديد (مساعد مشرف) لحلقة قائمة عبر رمز دعوة المعلّمين
 * الخاص بها (منفصل عن رمز دعوة الطلاب). يرجع null لو الرمز غير صحيح.
 * إنشاء الحساب وهويته الموحّدة (M5) بترانزاكشن واحدة.
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

  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query(
      `INSERT INTO teachers (username, password_hash, halaqah_id, role, teacher_name, email_verified, created_at)
       VALUES ($1, $2, $3, 'assistant', $4, $5, $6) RETURNING id`,
      [username, passwordHash, halaqahId, teacherName, emailVerified, new Date().toISOString()],
    );
    const teacherId = Number(rows.rows[0].id);
    await ensureTeacherIdentity(client, {
      id: teacherId,
      username,
      teacherName,
      halaqahId,
      role: "assistant",
    });
    await client.query("COMMIT");
    return teacherId;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function findTeacherByUsername(
  username: string,
): Promise<(Teacher & { passwordHash: string }) | null> {
  const rows = await db().sql`
    SELECT t.id, t.username, t.password_hash, t.teacher_name, t.email_verified, t.role, t.session_version,
           t.deactivated_at, h.id AS halaqah_id, h.name AS halaqah_name
    FROM teachers t JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE t.username = ${username}
  `;
  const row = rows[0];
  return row ? rowToTeacherAccount(row) : null;
}

/**
 * دخول جوجل لحساب قائم: يرجع معرّف المعلّم صاحب هذا البريد، أو null إن لم
 * يكن له حساب (فالمتصل يحوّله لتسجيل حساب جديد — لا إنشاء صامت). البريد
 * نفسه عمود username. يُستدعى فقط ببريد أكّدته جوجل (email_verified=true).
 */
export async function findTeacherIdByGoogleEmail(email: string): Promise<number | null> {
  const existing = await findTeacherByUsername(email);
  if (!existing) return null;
  // حساب موقوف من مشرف الحلقة: يُرفض دخوله بجوجل كما بكلمة المرور —
  // رسالة الإيقاف تصل للمستخدم عبر ?googleError= بمسار الاستدعاء
  if (existing.deactivatedAt) throw new Error("تم إيقاف حسابك من مشرف الحلقة");
  // دخول جوجل يثبت ملكية البريد: حساب غير موثّق قد يسجّله منتحل بكلمة
  // مرور يعرفها، فنُبطِلها فوراً (بصمة بلا ":" لا يتحقق منها verifyPassword أبداً)
  if (!existing.emailVerified) {
    // رفع نسخة الجلسة مع إبطال كلمة المرور — الجلسات القديمة تسقط معها
    await db().sql`
      UPDATE teachers SET password_hash = ${randomBytes(32).toString("hex")}, email_verified = true,
                          session_version = session_version + 1
      WHERE id = ${existing.id} AND email_verified = false
    `;
  }
  return existing.id;
}

/**
 * يجد معلّماً ببريده أو ينشئ له حلقة جديدة بكلمة مرور عشوائية. مسار الدخول
 * بجوجل صار يستعمل findTeacherIdByGoogleEmail (لا إنشاء صامت)؛ هذي للإنشاء
 * الصريح فقط.
 */
export async function findOrCreateTeacherByEmail(email: string, name = ""): Promise<number> {
  const existingId = await findTeacherIdByGoogleEmail(email);
  if (existingId !== null) return existingId;

  const randomPasswordHash = randomBytes(32).toString("hex");
  // بريد جوجل موثّق من جوجل نفسها — نعتبره مؤكَّداً هنا فوراً
  return createHalaqahWithSupervisor(email, randomPasswordHash, "", true, name);
}

export async function findTeacherById(id: number): Promise<Teacher | null> {
  const rows = await db().sql`
    SELECT t.id, t.username, t.password_hash, t.teacher_name, t.email_verified, t.role, t.session_version,
           t.deactivated_at, h.id AS halaqah_id, h.name AS halaqah_name
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

// ————— نسخة الجلسة (إبطال فوري لكل الجلسات) —————

/** نسخة جلسة الحساب الحالية — قراءة واحدة بمفتاح أساسي، لإصدار رمز جديد */
export async function teacherSessionVersion(id: number): Promise<number> {
  const rows = await db().sql`SELECT session_version FROM teachers WHERE id = ${id}`;
  return Number(rows[0]?.session_version ?? 0);
}

/** يرفع نسخة الجلسة فيُبطل فوراً كل رموز الجلسة الصادرة سابقاً لهذا الحساب */
export async function bumpTeacherSessionVersion(id: number): Promise<void> {
  await db().sql`UPDATE teachers SET session_version = session_version + 1 WHERE id = ${id}`;
}

// ————— اقتراحات تطوير من المعلّم (تصل للمطوّر فقط) —————

export type SuggestionType = "suggestion" | "problem";

export type SuggestionAttachmentMeta = { id: number; sizeBytes: number };

export type Suggestion = {
  id: number;
  senderLabel: string;
  message: string;
  createdAt: string;
  type: SuggestionType;
  /** من أرسله — يُضاف عند دمج اقتراحات النظامين بلوحة المطوّر، اختياري هنا */
  source?: "teacher" | "student";
  /** حالة المعالجة بلوحة المطوّر — الصفوف القديمة قبل الترحيل = "new" (افتراضي العمود) */
  status: ReportStatus;
  /** بيانات وصفية فقط (id وsize_bytes) — لا BYTEA إطلاقاً بقائمة الاقتراحات (STEP 55ب) */
  attachments: SuggestionAttachmentMeta[];
};

/** حالة بلاغ/اقتراح بلوحة المطوّر: جديد → مرئي → منجز (أو العودة لأي حالة) */
export type ReportStatus = "new" | "seen" | "done";

/** يستخرج {id, sizeBytes}[] من عمود JSON نصّي (json_agg مُجمَّع بالاستعلام) — [] لعدم وجود أي مرفق */
function parseAttachmentsJson(raw: unknown): SuggestionAttachmentMeta[] {
  if (!raw) return [];
  const parsed = JSON.parse(raw as string) as { id: number; sizeBytes: number }[];
  return parsed.map((a) => ({ id: a.id, sizeBytes: a.sizeBytes }));
}

/**
 * ينشئ اقتراح/بلاغ معلّم بمرفقاته معاً في ترانزاكشن واحد — فشل أي مرفق
 * (صيغة مرفوضة، تعذّر معالجة) يُلغي البلاغ كله (ROLLBACK)، لا يُنشئ
 * بلاغاً بلا الصور التي ظنّ المرسل أنها أُرفقت.
 */
export async function addSuggestion(
  senderId: number,
  senderLabel: string,
  message: string,
  type: SuggestionType = "suggestion",
  images: ProcessedImage[] = [],
): Promise<number> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO suggestions (sender_id, sender_label, message, type, created_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [senderId, senderLabel, message, type, new Date().toISOString()],
    );
    const id = Number(inserted.rows[0].id);
    await insertSuggestionAttachments(client, { teacherSuggestionId: id }, images);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listSuggestions(): Promise<Suggestion[]> {
  const rows = await db().sql`
    SELECT s.id, s.sender_label, s.message, s.type, s.created_at, s.status,
    (SELECT json_agg(json_build_object('id', a.id, 'sizeBytes', a.size_bytes) ORDER BY a.id)::text
     FROM suggestion_attachments a WHERE a.teacher_suggestion_id = s.id) AS attachments_json
    FROM suggestions s ORDER BY s.created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id as number,
    senderLabel: row.sender_label as string,
    message: row.message as string,
    createdAt: row.created_at as string,
    type: (row.type as SuggestionType) ?? "suggestion",
    status: (row.status as ReportStatus) ?? "new",
    attachments: parseAttachmentsJson(row.attachments_json),
  }));
}

// ————— اقتراح/بلاغ الطالب + مرفقات صور البلاغات (STEP 55) —————

export type StudentSuggestionKind = "suggestion" | "bug";

const STUDENT_SUGGESTION_LIMIT = 5;
const STUDENT_SUGGESTION_WINDOW_MINUTES = 60;

/** هل ما زال هذا الطالب دون سقف ٥ اقتراحات/بلاغات بالساعة الماضية؟ فحص فقط بلا تسجيل — العدّاد هو الجدول نفسه، لا جدول محاولات منفصل (كل صف هنا محتوى حقيقي يستحق الاحتفاظ به، لا محاولة فاشلة) */
export async function checkStudentSuggestionRateLimit(teacherId: number, studentId: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM student_suggestions
    WHERE teacher_id = ${teacherId} AND student_id = ${studentId}
      AND created_at > now() - (${STUDENT_SUGGESTION_WINDOW_MINUTES} || ' minutes')::interval
  `;
  return Number(rows[0]?.n ?? 0) < STUDENT_SUGGESTION_LIMIT;
}


/** يُدرج مرفقات بلاغ — يُستدعى داخل ترانزاكشن قائمة فقط. الحد الأقصى (٣) يُتحقَّق منه قبل استدعائها في مسار الـAPI */
async function insertSuggestionAttachments(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  target: { teacherSuggestionId?: number; studentSuggestionId?: number; reportId?: number },
  images: ProcessedImage[],
): Promise<void> {
  for (const img of images) {
    await client.query(
      `INSERT INTO suggestion_attachments
        (teacher_suggestion_id, student_suggestion_id, report_id, mime, bytes, size_bytes, width, height)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        target.teacherSuggestionId ?? null,
        target.studentSuggestionId ?? null,
        target.reportId ?? null,
        img.mime,
        img.bytes,
        img.sizeBytes,
        img.width,
        img.height,
      ],
    );
  }
}

/** ينشئ اقتراح/بلاغ طالب بمرفقاته معاً في ترانزاكشن واحد — نفس مبدأ addSuggestion تماماً */
export async function addStudentSuggestion(
  teacherId: number,
  studentId: string,
  kind: StudentSuggestionKind,
  body: string,
  images: ProcessedImage[] = [],
): Promise<number> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO student_suggestions (teacher_id, student_id, kind, body) VALUES ($1,$2,$3,$4) RETURNING id`,
      [teacherId, studentId, kind, body],
    );
    const id = Number(inserted.rows[0].id);
    await insertSuggestionAttachments(client, { studentSuggestionId: id }, images);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** اقتراحات/بلاغات الطلاب — لدمجها بلوحة المطوّر (source: "student") مع اسم الطالب وحلقته الفعليين وقت العرض، لا نسخة محفوظة وقت الإرسال */
export async function listNativeStudentSuggestions(): Promise<Suggestion[]> {
  const rows = await db().sql`
    SELECT ss.id, ss.kind, ss.body, ss.created_at, ss.status, st.name AS student_name, h.name AS halaqah_name,
    (SELECT json_agg(json_build_object('id', a.id, 'sizeBytes', a.size_bytes) ORDER BY a.id)::text
     FROM suggestion_attachments a WHERE a.student_suggestion_id = ss.id) AS attachments_json
    FROM student_suggestions ss
    JOIN students st ON st.teacher_id = ss.teacher_id AND st.id = ss.student_id
    JOIN halaqahs h ON h.id = ss.teacher_id
    ORDER BY ss.created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id as number,
    senderLabel: `${row.student_name as string} (${row.halaqah_name as string})`,
    message: row.body as string,
    createdAt: row.created_at as string,
    type: (row.kind as StudentSuggestionKind) === "bug" ? "problem" : "suggestion",
    status: (row.status as ReportStatus) ?? "new",
    attachments: parseAttachmentsJson(row.attachments_json),
  }));
}

/** بيانات صورة مرفق واحدة (bytea) — للأدمن فقط، عبر id فريد بلا حاجة لمعرفة مصدرها (معلّم أو طالب) */
export async function getSuggestionAttachmentImage(id: number): Promise<{ mime: string; bytes: Buffer } | null> {
  const rows = await db().sql`
    SELECT mime, bytes FROM suggestion_attachments WHERE id = ${id}
  `;
  if (rows.length === 0) return null;
  return { mime: rows[0].mime as string, bytes: rows[0].bytes as Buffer };
}

// ————— بلاغات أولياء الأمور ومدراء الجوامع (dev split) —————
// نفس نمط اقتراحات المعلّم/الطالب تماماً لكن بجدول مستقل: reporter_kind
// يحدد جدول المرسل (parents أو mosque_admins) وتسميته تُحسب وقت العرض
// بربط الجدولين فتبقى صحيحة بعد أي تغيير اسم.

export type ReportReporterKind = "parent" | "mosque_admin";

/** ينشئ بلاغ ولي أمر/مدير جامع بمرفقاته في ترانزاكشن واحد — نفس مبدأ addSuggestion */
export async function addReport(
  reporterKind: ReportReporterKind,
  reporterId: number,
  message: string,
  type: SuggestionType = "suggestion",
  images: ProcessedImage[] = [],
): Promise<number> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO reports (reporter_kind, reporter_id, type, message) VALUES ($1,$2,$3,$4) RETURNING id`,
      [reporterKind, reporterId, type, message],
    );
    const id = Number(inserted.rows[0].id);
    await insertSuggestionAttachments(client, { reportId: id }, images);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** بلاغات أولياء الأمور ومدراء الجوامع — تسمية المرسل محسوبة وقت العرض (ولي: name+email، مدير: username+الجامع) */
export async function listReports(): Promise<(Suggestion & { reporterKind: ReportReporterKind })[]> {
  const rows = await db().sql`
    SELECT r.id, r.reporter_kind, r.type, r.message, r.status, r.created_at,
           CASE WHEN r.reporter_kind = 'parent'
                THEN p.name || ' (' || p.email || ')'
                ELSE a.username || ' (' || COALESCE(m.name, '') || ')' END AS sender_label,
    (SELECT json_agg(json_build_object('id', at.id, 'sizeBytes', at.size_bytes) ORDER BY at.id)::text
     FROM suggestion_attachments at WHERE at.report_id = r.id) AS attachments_json
    FROM reports r
    LEFT JOIN parents p ON r.reporter_kind = 'parent' AND p.id = r.reporter_id
    LEFT JOIN mosque_admins a ON r.reporter_kind = 'mosque_admin' AND a.id = r.reporter_id
    LEFT JOIN mosques m ON m.id = a.mosque_id
    ORDER BY r.created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id as number,
    senderLabel: row.sender_label as string,
    message: row.message as string,
    createdAt: row.created_at as string,
    type: (row.type as SuggestionType) ?? "suggestion",
    status: (row.status as ReportStatus) ?? "new",
    reporterKind: row.reporter_kind as ReportReporterKind,
    attachments: parseAttachmentsJson(row.attachments_json),
  }));
}

/** يغيّر حالة بلاغ معلّم — false إن لم يوجد الصف */
export async function setTeacherSuggestionStatus(id: number, status: ReportStatus): Promise<boolean> {
  const rows = await db().sql`UPDATE suggestions SET status = ${status} WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** يغيّر حالة بلاغ طالب — false إن لم يوجد الصف */
export async function setStudentSuggestionStatus(id: number, status: ReportStatus): Promise<boolean> {
  const rows = await db().sql`UPDATE student_suggestions SET status = ${status} WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** يغيّر حالة بلاغ ولي أمر/مدير جامع — false إن لم يوجد الصف */
export async function setReportStatus(id: number, status: ReportStatus): Promise<boolean> {
  const rows = await db().sql`UPDATE reports SET status = ${status} WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
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
    WHERE token_hash = ${hashToken(token)} AND expires_at > now() AND kind = 'link'
    RETURNING teacher_id
  `;
  return rows[0] ? Number(rows[0].teacher_id) : null;
}

// ————— رمز الاسترجاع المكوّن من ٦ أرقام —————
// الصف في password_resets بـkind='code': token_hash = HMAC الرمز، attempts = الخاطئة.

/** يخزّن بصمة رمز جديد ويُبطل أي رمز سابق لنفس المعلّم (روابط الاسترجاع القديمة لا تُمَس) */
export async function replaceResetCode(teacherId: number, codeHash: string, expiresAt: Date): Promise<void> {
  await db().sql`DELETE FROM password_resets WHERE teacher_id = ${teacherId} AND kind = 'code'`;
  await db().sql`
    INSERT INTO password_resets (teacher_id, token_hash, expires_at, created_at, kind, attempts)
    VALUES (${teacherId}, ${codeHash}, ${expiresAt.toISOString()}, ${new Date().toISOString()}, 'code', 0)
  `;
}

/** يحتسب محاولة ذرّياً على الرمز الفعّال (غير المنتهي) ويرجع بصمته وعدّاده بعد الزيادة، أو null */
export async function bumpResetCodeAttempt(
  teacherId: number,
  now: Date,
): Promise<{ id: number; codeHash: string; attempts: number } | null> {
  const rows = await db().sql`
    UPDATE password_resets SET attempts = attempts + 1
    WHERE teacher_id = ${teacherId} AND kind = 'code' AND expires_at > ${now.toISOString()}
    RETURNING id, token_hash, attempts
  `;
  const row = rows[0];
  return row ? { id: Number(row.id), codeHash: row.token_hash as string, attempts: Number(row.attempts) } : null;
}

/** يحرق صفاً بعينه — true فقط لمن حذفه فعلاً (يضمن الاستخدام لمرة واحدة عند التزامن) */
export async function burnResetCode(id: number): Promise<boolean> {
  const rows = await db().sql`DELETE FROM password_resets WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

/** يعيّن كلمة المرور عبر الاسترجاع: يُثبت ملكية البريد، يرفع نسخة الجلسة، ويحذف كل رموز/روابط الاسترجاع المعلّقة */
export async function setTeacherPasswordViaReset(teacherId: number, passwordHash: string): Promise<void> {
  await db().sql`UPDATE teachers SET password_hash = ${passwordHash}, email_verified = true,
    session_version = session_version + 1 WHERE id = ${teacherId}`;
  await db().sql`DELETE FROM password_resets WHERE teacher_id = ${teacherId}`;
}

export async function updateTeacherPassword(teacherId: number, passwordHash: string): Promise<void> {
  // رفع نسخة الجلسة بإطلاق كلمة المرور: كل جلسات الأجهزة الأخرى تسقط فوراً
  await db().sql`UPDATE teachers SET password_hash = ${passwordHash}, session_version = session_version + 1
    WHERE id = ${teacherId}`;
}

/** بصمة كلمة مرور المعلّم الحالية — للتحقق من «الحالية» عند تغييرها من الإعدادات فقط */
export async function teacherPasswordHash(teacherId: number): Promise<string | null> {
  const rows = await db().sql`SELECT password_hash FROM teachers WHERE id = ${teacherId}`;
  return (rows[0]?.password_hash as string | undefined) ?? null;
}

/** اسم المعلّم (للعرض) — المعرّف من جلسة المعلّم حصراً */
export async function updateTeacherName(teacherId: number, name: string): Promise<void> {
  await db().sql`UPDATE teachers SET teacher_name = ${name} WHERE id = ${teacherId}`;
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

/** إدخال/تحديث طالب (يرجع true إن كان إدخالاً جديداً) — الإدخال ينشئ معه هويته الموحّدة (M5) بنفس الترانزاكشن،
 * بنفس قاعدة backfill الترحيل: طالب بلا اسم مستخدم يُنشأ له مقبض اصطناعي. */
export async function upsertStudent(teacherId: number, student: Student, sortOrder = 0): Promise<boolean> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const upserted = await client.query(
      `INSERT INTO students (id, teacher_id, name, group_name, ranges, mastery, active, rating, sort_order, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
       ON CONFLICT (teacher_id, id) DO UPDATE SET
         name = excluded.name,
         group_name = excluded.group_name,
         ranges = excluded.ranges,
         mastery = excluded.mastery,
         active = excluded.active,
         rating = excluded.rating
       RETURNING (xmax = 0) AS inserted`,
      [
        student.id,
        teacherId,
        student.name,
        student.group ?? "",
        JSON.stringify(student.ranges ?? []),
        JSON.stringify(student.mastery ?? {}),
        !!student.active,
        student.rating ?? 0,
        sortOrder,
      ],
    );
    await ensureStudentIdentity(client, {
      halaqahId: teacherId,
      id: student.id,
      name: student.name,
      username: null,
      active: !!student.active,
    });
    await client.query("COMMIT");
    return upserted?.rows?.[0]?.inserted === true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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

/** حذف ناعم — يبقى السطر ٢٤ ساعة قابلاً للاسترجاع بدل حذفه فوراً.
 * يُطفئ عضوية هوية الطالب (M5) إن وُجدت — أفضل جهد لا أكثر: التحقق الفعلي
 * عند أي تبديل دور يقرأ صف الطالب الحي، فبقاء العلم قديماً لا يفتح شيئاً. */
export async function deleteStudent(teacherId: number, id: string): Promise<boolean> {
  const rows = await db().sql`
    UPDATE students SET deleted_at = now()
    WHERE teacher_id = ${teacherId} AND id = ${id} AND deleted_at IS NULL
    RETURNING id
  `;
  if (rows.length > 0) {
    await db().sql`
      UPDATE memberships SET active = FALSE
      WHERE legacy_kind = 'student' AND legacy_id = ${`${teacherId}:${id}`}
    `;
  }
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
  if (rows.length > 0) {
    await db().sql`
      UPDATE memberships SET active = TRUE
      WHERE legacy_kind = 'student' AND legacy_id = ${`${teacherId}:${id}`}
    `;
  }
  return rows.length > 0;
}

/** يستبدل قائمة الطلاب كاملة — تُستخدم للحلقة التجريبية ولمسح البيانات.
 * كل طالب مدرج يحصل على هويته الموحّدة (M5) بنفس الترانزاكشن؛ صفوف من
 * استُبدلوا تبقى عضوياتهم القديمة بلا إسناد (لا FK عمداً) ولا تُفتح شيئاً. */
export async function replaceStudents(teacherId: number, students: Student[]): Promise<void> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM students WHERE teacher_id = $1", [teacherId]);
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      await client.query(
        `INSERT INTO students (id, teacher_id, name, group_name, ranges, mastery, active, rating, sort_order, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
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
      await ensureStudentIdentity(client, {
        halaqahId: teacherId,
        id: s.id,
        name: s.name,
        username: null,
        active: !!s.active,
      });
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

/** يمنح الطالب اسم مستخدم وكلمة مرور، أو يحدّثهما. يرمي عند تكرار الاسم.
 * من لحظة منح الطالب دخولاً يصبح صاحب هوية موحّدة (M5): user+membership
 * تنشآن/تُحدَّثان بترانزاكشن التحديث نفسها. */
export async function setStudentCredentials(
  teacherId: number,
  studentId: string,
  username: string,
  passwordHash: string,
): Promise<void> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const exists = await client.query(`SELECT 1 FROM students WHERE teacher_id = $1 AND id = $2`, [
      teacherId,
      studentId,
    ]);
    if (exists.rowCount === 0) {
      await client.query("ROLLBACK");
      throw new Error("الطالب غير موجود");
    }

    const taken = await client.query(
      `SELECT 1 FROM students
       WHERE username = $1 AND NOT (teacher_id = $2 AND id = $3)`,
      [username, teacherId, studentId],
    );
    if ((taken.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      throw new Error("اسم المستخدم مستخدم من قبل");
    }

    const updated = await client.query(
      `UPDATE students SET username = $1, password_hash = $2, session_version = session_version + 1
       WHERE teacher_id = $3 AND id = $4
       RETURNING name, active`,
      [username, passwordHash, teacherId, studentId],
    );
    await ensureStudentIdentity(client, {
      halaqahId: teacherId,
      id: studentId,
      name: updated.rows[0].name as string,
      username,
      active: updated.rows[0].active === true,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
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
): Promise<{ teacherId: number; id: string; name: string; passwordHash: string; sessionVersion: number } | null> {
  const rows = await db().sql`
    SELECT teacher_id, id, name, password_hash, session_version FROM students
    WHERE username = ${username} AND deleted_at IS NULL
  `;
  const row = rows[0];
  if (!row || !row.password_hash) return null;
  return {
    teacherId: row.teacher_id,
    id: row.id,
    name: row.name,
    passwordHash: row.password_hash,
    sessionVersion: Number(row.session_version ?? 0),
  };
}

/**
 * هوية الطالب لجلسته: اسمه واسم حلقته — أو null إن حُذف أو أُلغي حسابه.
 * المعامل الأول هنا معرّف الحلقة (halaqah_id) — students.teacher_id
 * يحمل قيمة الحلقة منذ إضافة تعدّد المعلّمين، رغم بقاء اسم العمود.
 */
export async function findStudentAccount(
  halaqahId: number,
  studentId: string,
): Promise<(StudentAccount & { sessionVersion: number }) | null> {
  const rows = await db().sql`
    SELECT s.id, s.name, s.session_version, h.name AS halaqah_name
    FROM students s JOIN halaqahs h ON h.id = s.teacher_id
    WHERE s.teacher_id = ${halaqahId} AND s.id = ${studentId} AND s.deleted_at IS NULL
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    teacherId: halaqahId,
    id: row.id,
    name: row.name,
    halaqahName: row.halaqah_name,
    sessionVersion: Number(row.session_version ?? 0),
  };
}

/** نسخة جلسة الطالب الحالية — قراءة واحدة بمفتاح أساسي مركّب، لإصدار رمز جديد */
export async function studentSessionVersion(halaqahId: number, studentId: string): Promise<number> {
  const rows = await db().sql`
    SELECT session_version FROM students WHERE teacher_id = ${halaqahId} AND id = ${studentId}
  `;
  return Number(rows[0]?.session_version ?? 0);
}

// ————— سجلّات الورد اليومي —————

/** مقطع مراجعة جاهز للتخزين — صفحاته محسوبة مسبقاً بالخادم (نفس نمط hifzFrom/hifzTo) */
export type NewReviewSegment = AyahRange & { fromPage: number; toPage: number };

export type NewWardLog = {
  date: string;
  hifzFrom: number | null;
  hifzTo: number | null;
  reviewFrom: number | null;
  reviewTo: number | null;
  /** موضع السورة/الآية الأصلي (STEP 49) — null لورد مُرسَل بالصفحات فقط (لا يوجد بعد هذا التحديث، لكن العمود يبقى اختيارياً) */
  hifzAyah: AyahRange | null;
  /** يُترك null دائماً للإرسالات الجديدة (STEP 52 فصاعداً تستخدم reviewSegments) — يبقى فقط لصفوف قديمة محتملة */
  reviewAyah: AyahRange | null;
  /** مقاطع المراجعة الجديدة (STEP 52، ١ إلى ١٠) — null لعدم وجود مراجعة اليوم */
  reviewSegments: NewReviewSegment[] | null;
  /** تصنيف كل مقطع كبرى/صغرى (B3) — محاذٍ لreviewSegments (أقصر يعني الباقي بلا تصنيف)، null/غائب = بلا تصنيفات */
  reviewSegmentTracks?: (ReviewTrack | null)[] | null;
  note: string;
  /** زميل المراجعة المختار (STEP 56) — undefined/null لعدم اختيار زميل */
  buddyStudentId?: string | null;
};

/** يبني نطاق سورة/آية من أربعة أعمدة متجاورة، أو null لو أيّ منها فارغ (ورد قديم بالصفحات فقط) */
function ayahRangeFromRow(
  row: Record<string, unknown>,
  fromSurahCol: string,
  fromAyahCol: string,
  toSurahCol: string,
  toAyahCol: string,
): AyahRange | null {
  const fromSurah = row[fromSurahCol] as number | null;
  const fromAyah = row[fromAyahCol] as number | null;
  const toSurah = row[toSurahCol] as number | null;
  const toAyah = row[toAyahCol] as number | null;
  if (fromSurah === null || fromAyah === null || toSurah === null || toAyah === null) return null;
  return { fromSurah, fromAyah, toSurah, toAyah };
}

/** صف مقطع مراجعة كما يرجع من json_agg (نصاً — نحوّله صراحة، بلا اعتماد على تفسير السائق التلقائي لعمود json) */
type ReviewSegmentJson = {
  fromSurah: number;
  fromAyah: number;
  toSurah: number;
  toAyah: number;
  fromPage: number;
  toPage: number;
  track?: ReviewTrack | null;
};

function rowToWard(row: Record<string, unknown>): WardLog {
  const hifzFrom = row.hifz_from as number | null;
  const hifzTo = row.hifz_to as number | null;
  const reviewFrom = row.review_from as number | null;
  const reviewTo = row.review_to as number | null;

  const segmentsJson = row.review_segments_json as string | null;
  const segmentsRaw: ReviewSegmentJson[] | null = segmentsJson ? JSON.parse(segmentsJson) : null;
  const reviewSegments: AyahRange[] | null = segmentsRaw
    ? segmentsRaw.map(({ fromSurah, fromAyah, toSurah, toAyah }) => ({ fromSurah, fromAyah, toSurah, toAyah }))
    : null;
  const reviewPagesTotal = segmentsRaw
    ? segmentsRaw.reduce((sum, s) => sum + (s.toPage - s.fromPage + 1), 0)
    : reviewFrom !== null && reviewTo !== null
      ? reviewTo - reviewFrom + 1
      : 0;
  // B3: التصنيفات وصفحات المقاطع تُقرأ فقط لو طابقت عدد المقاطع — ورد
  // قديم أو صفوف غير متسقة (لا ينبغي) تُعامَل كبلا تصنيف، لا تُفجّر العرض
  const aligned = segmentsRaw !== null && segmentsRaw.length > 0;
  const reviewSegmentTracks: (ReviewTrack | null)[] | null = aligned
    ? segmentsRaw!.map((s) => (s.track === "sabqi" || s.track === "manzil" ? s.track : null))
    : null;
  const reviewSegmentPages =
    aligned ? segmentsRaw!.map(({ fromPage, toPage }) => ({ from: fromPage, to: toPage })) : null;

  return {
    id: row.id as number,
    studentId: row.student_id as string,
    studentName: row.student_name as string,
    date: row.date as string,
    hifz: hifzFrom !== null && hifzTo !== null ? { from: hifzFrom, to: hifzTo } : null,
    review: reviewFrom !== null && reviewTo !== null ? { from: reviewFrom, to: reviewTo } : null,
    hifzAyah: ayahRangeFromRow(row, "hifz_from_surah", "hifz_from_ayah", "hifz_to_surah", "hifz_to_ayah"),
    reviewAyah: ayahRangeFromRow(row, "review_from_surah", "review_from_ayah", "review_to_surah", "review_to_ayah"),
    reviewSegments,
    reviewPagesTotal,
    reviewSegmentTracks,
    reviewSegmentPages,
    note: row.note as string,
    status: row.status as WardStatus,
    createdAt: row.created_at as string,
    previousAttemptId: (row.previous_attempt_id as number | null) ?? null,
    reviewedBy: (row.reviewed_by as number | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    reviewNote: (row.review_note as string | null) ?? null,
    ...(row.error_score !== null && row.error_score !== undefined
      ? {
          errorScore: Number(row.error_score),
          errorBand: (row.error_band as string | null) ?? null,
          errorCounts: (row.error_counts as Record<string, number> | null) ?? null,
        }
      : {}),
    buddy: row.buddy_json ? (JSON.parse(row.buddy_json as string) as WardReviewBuddy) : null,
  };
}

/**
 * آخر محاولة "تحتاج إعادة" لهذا الطالب لم تُربَط بعد بأي محاولة لاحقة —
 * أو null لو لا توجد. تُستخدَم داخلياً فقط لربط سلسلة المحاولات تلقائياً؛
 * لا تُستدعى من أي مسار API مباشرة، ولا تقبل أي مدخل من العميل.
 */
async function findOpenRevisionAttempt(teacherId: number, studentId: string): Promise<number | null> {
  const rows = await db().sql`
    SELECT id FROM ward_logs
    WHERE teacher_id = ${teacherId} AND student_id = ${studentId} AND status = 'needs_revision'
      AND id NOT IN (
        SELECT previous_attempt_id FROM ward_logs
        WHERE teacher_id = ${teacherId} AND student_id = ${studentId} AND previous_attempt_id IS NOT NULL
      )
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `;
  return rows[0] ? Number(rows[0].id) : null;
}

/**
 * ينشئ محاولة ورد جديدة. لو كانت هناك محاولة سابقة بحالة needs_revision
 * لم تُستأنَف بعد لنفس الطالب، تُربَط تلقائياً عبر previous_attempt_id —
 * مُشتَقّ من الخادم حصراً (استعلام داخلي)، لا يُقبَل من أي استدعاء خارجي
 * ولا يُمرَّر كمعامل. المحاولة القديمة لا تُعدَّل أبداً.
 */
export async function createWardLog(
  teacherId: number,
  studentId: string,
  log: NewWardLog,
): Promise<{ id: number; previousAttemptId: number | null }> {
  if (log.buddyStudentId) await assertValidBuddy(teacherId, studentId, log.buddyStudentId);
  const previousAttemptId = await findOpenRevisionAttempt(teacherId, studentId);
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO ward_logs
        (teacher_id, student_id, date, hifz_from, hifz_to, review_from, review_to,
         hifz_from_surah, hifz_from_ayah, hifz_to_surah, hifz_to_ayah,
         review_from_surah, review_from_ayah, review_to_surah, review_to_ayah,
         note, status, created_at, previous_attempt_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'new',$17,$18)
       RETURNING id`,
      [
        teacherId, studentId, log.date, log.hifzFrom, log.hifzTo, log.reviewFrom, log.reviewTo,
        log.hifzAyah?.fromSurah ?? null, log.hifzAyah?.fromAyah ?? null,
        log.hifzAyah?.toSurah ?? null, log.hifzAyah?.toAyah ?? null,
        log.reviewAyah?.fromSurah ?? null, log.reviewAyah?.fromAyah ?? null,
        log.reviewAyah?.toSurah ?? null, log.reviewAyah?.toAyah ?? null,
        log.note, new Date().toISOString(), previousAttemptId,
      ],
    );
    const id = Number(inserted.rows[0].id);
    await insertReviewSegments(client, id, log.reviewSegments, log.reviewSegmentTracks);
    await insertBuddy(client, id, teacherId, studentId, log.buddyStudentId ?? null);
    await client.query("COMMIT");
    return { id, previousAttemptId };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** يُدرج مقاطع مراجعة ورد — يُستدعى داخل ترانزاكشن قائمة فقط (createWardLog/updateWardLog). تصنيف كل مقطع (B3) اختياري: أقصر من المقاطع أو غائب = بلا تصنيف */
async function insertReviewSegments(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  wardLogId: number,
  segments: NewReviewSegment[] | null,
  tracks?: (ReviewTrack | null)[] | null,
): Promise<void> {
  if (!segments) return;
  for (const [i, seg] of segments.entries()) {
    await client.query(
      `INSERT INTO ward_review_segments
        (ward_log_id, segment_order, from_surah, from_ayah, to_surah, to_ayah, from_page, to_page, track)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [wardLogId, i + 1, seg.fromSurah, seg.fromAyah, seg.toSurah, seg.toAyah, seg.fromPage, seg.toPage, tracks?.[i] ?? null],
    );
  }
}

export type PriorSegmentRow = {
  segment_order: number;
  from_surah: number;
  from_ayah: number;
  to_surah: number;
  to_ayah: number;
  track: ReviewTrack | null;
};

/**
 * يحمل تصنيف كل مقطع قائم إلى مقطعه الجديد إن بقي بالموضع (segment_order)
 * والنطاق (سورة/آية البداية والنهاية) نفسيهما؛ غير ذلك = بلا تصنيف.
 */
export function carryOverReviewTracks(prior: PriorSegmentRow[], next: NewReviewSegment[]): (ReviewTrack | null)[] {
  return next.map((seg, i) => {
    const old = prior.find((p) => Number(p.segment_order) === i + 1);
    if (
      old &&
      Number(old.from_surah) === seg.fromSurah &&
      Number(old.from_ayah) === seg.fromAyah &&
      Number(old.to_surah) === seg.toSurah &&
      Number(old.to_ayah) === seg.toAyah
    ) {
      return old.track ?? null;
    }
    return null;
  });
}

/**
 * هل تغيّر محتوى الورد فعلياً؟ — التاريخ أو أي حقل حفظ/مراجعة بما فيها
 * مقاطع المراجعة. الملاحظة ليست محتوى: تعديلها وحده لا يبرّر إعادة طلب
 * التأكيد من الزميل.
 */
function wardContentChanged(old: Record<string, unknown> | undefined, log: NewWardLog): boolean {
  if (!old) return false;
  const oldSegmentsRaw = old.review_segments_json
    ? (JSON.parse(old.review_segments_json as string) as ReviewSegmentJson[])
    : null;
  const oldSegments = oldSegmentsRaw?.length
    ? oldSegmentsRaw.map(({ fromSurah, fromAyah, toSurah, toAyah }) => [fromSurah, fromAyah, toSurah, toAyah])
    : null;
  const newSegments = log.reviewSegments?.length
    ? log.reviewSegments.map(({ fromSurah, fromAyah, toSurah, toAyah }) => [fromSurah, fromAyah, toSurah, toAyah])
    : null;

  const scalarPairs: [unknown, unknown][] = [
    [old.date, log.date],
    [old.hifz_from ?? null, log.hifzFrom],
    [old.hifz_to ?? null, log.hifzTo],
    [old.review_from ?? null, log.reviewFrom],
    [old.review_to ?? null, log.reviewTo],
    [old.hifz_from_surah ?? null, log.hifzAyah?.fromSurah ?? null],
    [old.hifz_from_ayah ?? null, log.hifzAyah?.fromAyah ?? null],
    [old.hifz_to_surah ?? null, log.hifzAyah?.toSurah ?? null],
    [old.hifz_to_ayah ?? null, log.hifzAyah?.toAyah ?? null],
    [old.review_from_surah ?? null, log.reviewAyah?.fromSurah ?? null],
    [old.review_from_ayah ?? null, log.reviewAyah?.fromAyah ?? null],
    [old.review_to_surah ?? null, log.reviewAyah?.toSurah ?? null],
    [old.review_to_ayah ?? null, log.reviewAyah?.toAyah ?? null],
  ];
  return (
    scalarPairs.some(([a, b]) => a !== b) ||
    JSON.stringify(oldSegments) !== JSON.stringify(newSegments)
  );
}

/**
 * يعدّل ورداً موجوداً — فقط لو كان يملكه هذا الطالب بالضبط (نفس الحلقة
 * والمعرّف) وكانت حالته قابلة للتعديل (new أو seen، عبر lib/ward-ayah.ts
 * canEditWard — نفس الشرط حرفياً). الشرط بالكامل داخل جملة UPDATE نفسها
 * لا كتحقّق منفصل قبلها — لو رجعت صفر صفوف فإما الورد ليس ملك هذا
 * الطالب أو صار مقفلاً بين قراءته وتعديله (سباق)، والفرق لا يهم الطالب:
 * كلا الحالتين "لا يمكنك تعديل هذا الورد". buddyResetTo يحمل معرّف
 * الزميل لو أُعيد طلب تأكيده (خيار الحلقة) — لإشعاره من المسار.
 */
export async function updateWardLog(
  teacherId: number,
  studentId: string,
  id: number,
  log: NewWardLog,
): Promise<{ updated: boolean; buddyResetTo: string | null }> {
  if (log.buddyStudentId) await assertValidBuddy(teacherId, studentId, log.buddyStudentId);
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    // خيار الحلقة يُقرأ قبل التعديل (مفتاح أساسي رخيص)، والمحتوى القديم
    // لا يُقرأ إلا لو كان مفعّلاً — لأن UPDATE نفسه يطمسه، ولا حاجة له
    // في السلوك الافتراضي (خيار مغلق = تماماً كما كان قبل هذا الخيار).
    const setting = await client.query(`SELECT buddy_reset_on_edit FROM halaqahs WHERE id = $1`, [
      teacherId,
    ]);
    const resetOnEdit = setting.rows[0]?.buddy_reset_on_edit === true;
    let oldContent: Record<string, unknown> | undefined;
    if (resetOnEdit) {
      const old = await client.query(
        `SELECT w.date, w.hifz_from, w.hifz_to, w.review_from, w.review_to,
                w.hifz_from_surah, w.hifz_from_ayah, w.hifz_to_surah, w.hifz_to_ayah,
                w.review_from_surah, w.review_from_ayah, w.review_to_surah, w.review_to_ayah,
                (SELECT json_agg(json_build_object('fromSurah', rs.from_surah, 'fromAyah', rs.from_ayah,
                     'toSurah', rs.to_surah, 'toAyah', rs.to_ayah) ORDER BY rs.segment_order)::text
                 FROM ward_review_segments rs WHERE rs.ward_log_id = w.id) AS review_segments_json
         FROM ward_logs w WHERE w.id = $1 AND w.teacher_id = $2 AND w.student_id = $3`,
        [id, teacherId, studentId],
      );
      oldContent = old.rows[0];
    }
    // status = 'new' دائماً: لو كانت 'seen' (اطّلع عليها المعلّم) قبل
    // التعديل، تعديل الطالب يغيّر محتواها فعلياً فتحتاج اطّلاعاً جديداً —
    // ولو كانت 'new' أصلاً فهذا بلا أثر (نفس القيمة). 'approved' و
    // 'needs_revision' مستبعدتان أصلاً بشرط WHERE أسفله (لن يصل التنفيذ
    // هنا لهما إطلاقاً)، فلا خطر من "التراجع عن اعتماد" بالغلط.
    const updated = await client.query(
      `UPDATE ward_logs SET
         date = $1, hifz_from = $2, hifz_to = $3, review_from = $4, review_to = $5,
         hifz_from_surah = $6, hifz_from_ayah = $7, hifz_to_surah = $8, hifz_to_ayah = $9,
         review_from_surah = $10, review_from_ayah = $11, review_to_surah = $12, review_to_ayah = $13,
         note = $14, status = 'new',
         error_counts = NULL, error_score = NULL, error_band = NULL
       WHERE id = $15 AND teacher_id = $16 AND student_id = $17 AND status IN ('new', 'seen')`,
      [
        log.date, log.hifzFrom, log.hifzTo, log.reviewFrom, log.reviewTo,
        log.hifzAyah?.fromSurah ?? null, log.hifzAyah?.fromAyah ?? null,
        log.hifzAyah?.toSurah ?? null, log.hifzAyah?.toAyah ?? null,
        log.reviewAyah?.fromSurah ?? null, log.reviewAyah?.fromAyah ?? null,
        log.reviewAyah?.toSurah ?? null, log.reviewAyah?.toAyah ?? null,
        log.note, id, teacherId, studentId,
      ],
    );
    if ((updated.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { updated: false, buddyResetTo: null };
    }
    // استبدال كامل للمقاطع — أبسط وأصحّ من محاولة مطابقة/تحديث جزئي لقائمة أعيد إرسالها كاملة من الواجهة
    // تصنيفات المقاطع (B3): PUT بلا reviewTracks (undefined) يحفظ التصنيفات
    // القائمة لكل مقطع لم يتغيّر موضعه ونطاقه؛ مصفوفة صريحة (أو null) تُطبَّق كما هي
    let tracksToInsert = log.reviewSegmentTracks;
    if (tracksToInsert === undefined && log.reviewSegments?.length) {
      const prior = await client.query(
        `SELECT segment_order, from_surah, from_ayah, to_surah, to_ayah, track
         FROM ward_review_segments WHERE ward_log_id = $1 ORDER BY segment_order`,
        [id],
      );
      tracksToInsert = carryOverReviewTracks(
        (prior.rows ?? []) as PriorSegmentRow[],
        log.reviewSegments,
      );
    }
    await client.query(`DELETE FROM ward_review_segments WHERE ward_log_id = $1`, [id]);
    await insertReviewSegments(client, id, log.reviewSegments, tracksToInsert);
    // STEP 56 (تصحيح): الزميل نفسه بلا تغيير → لا حذف ولا إدراج، تبقى
    // حالته كما هي (confirmed تبقى confirmed) — إعادة الإدراج لأي سبب
    // آخر (حتى لو نفس الزميل) كانت تصفّر تأكيداً سابقاً بلا داعٍ.
    // الاستثناء الوحيد: خيار الحلقة مفعّل والمحتوى تغيّر فعلاً — يُحدَّث
    // الصف نفسه (لا حذف+إدراج) عائداً لـpending، فلا يبقى تأكيدٌ لمحتوى
    // لم يعد موجوداً. تغيير/إزالة الزميل تظل حذفاً+إدراجاً كما هي.
    const existingBuddy = await client.query(
      `SELECT buddy_student_id, status FROM ward_review_buddies WHERE ward_log_id = $1`,
      [id],
    );
    const existingBuddyId = (existingBuddy.rows[0]?.buddy_student_id as string | undefined) ?? null;
    const existingBuddyStatus = (existingBuddy.rows[0]?.status as string | undefined) ?? null;
    const newBuddyId = log.buddyStudentId ?? null;
    let buddyResetTo: string | null = null;
    if (existingBuddyId !== newBuddyId) {
      await client.query(`DELETE FROM ward_review_buddies WHERE ward_log_id = $1`, [id]);
      await insertBuddy(client, id, teacherId, studentId, newBuddyId);
    } else if (
      resetOnEdit &&
      newBuddyId !== null &&
      (existingBuddyStatus === "confirmed" || existingBuddyStatus === "declined") &&
      wardContentChanged(oldContent, log)
    ) {
      await client.query(
        `UPDATE ward_review_buddies SET status = 'pending', responded_at = NULL WHERE ward_log_id = $1 AND teacher_id = $2`,
        [id, teacherId],
      );
      buddyResetTo = newBuddyId;
    }
    await client.query("COMMIT");
    return { updated: true, buddyResetTo };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** يحذف ورداً — فقط لو كان يملكه هذا الطالب وكانت حالته قابلة للتعديل (نفس شرط updateWardLog). CASCADE يزيل مقاطع مراجعته تلقائياً */
export async function deleteWardLog(teacherId: number, studentId: string, id: number): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM ward_logs
    WHERE id = ${id} AND teacher_id = ${teacherId} AND student_id = ${studentId} AND status IN ('new', 'seen')
    RETURNING id
  `;
  return rows.length > 0;
}

// ————— زميل المراجعة (STEP 56) —————
// نفس الحلقة فقط مضمونة من قاعدة البيانات نفسها (مفتاحان مركّبان
// بـward_review_buddies)، لا من هذا الملف وحده — الفحوص هنا لرسالة خطأ
// عربية واضحة بدل رمي خطأ Postgres الخام عند انتهاك قيد، لا كحارس وحيد.

/** زملاء صالحون للاختيار بنموذج "سجّل وردي": نفس الحلقة، نشِطون، بلا الطالب نفسه — الاسم فقط */
export async function listHalaqahMates(teacherId: number, excludeStudentId: string): Promise<HalaqahMate[]> {
  const rows = await db().sql`
    SELECT id, name FROM students
    WHERE teacher_id = ${teacherId} AND id <> ${excludeStudentId}
      AND active = TRUE AND deleted_at IS NULL
    ORDER BY name
  `;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
}

/** يتحقّق أن الزميل المرشَّح صالح فعلاً قبل أي إدراج — رسالة عربية واضحة؛ قيد القاعدة (FK/CHECK) يبقى الحارس الأخير الفعلي */
async function assertValidBuddy(teacherId: number, requesterId: string, buddyId: string): Promise<void> {
  if (buddyId === requesterId) throw new Error("لا يمكن اختيار نفسك زميلاً");
  const rows = await db().sql`
    SELECT 1 FROM students
    WHERE teacher_id = ${teacherId} AND id = ${buddyId} AND active = TRUE AND deleted_at IS NULL
  `;
  if (!rows[0]) throw new Error("هذا الزميل غير متاح");
}

/** يُدرج صفّ زميل مراجعة بحالة pending — يُستدعى داخل ترانزاكشن قائمة فقط (createWardLog/updateWardLog)، بعد assertValidBuddy مسبقاً */
async function insertBuddy(
  client: { query: (text: string, params?: unknown[]) => Promise<unknown> },
  wardLogId: number,
  teacherId: number,
  requesterStudentId: string,
  buddyStudentId: string | null,
): Promise<void> {
  if (!buddyStudentId) return;
  await client.query(
    `INSERT INTO ward_review_buddies (ward_log_id, teacher_id, requester_student_id, buddy_student_id, status)
     VALUES ($1,$2,$3,$4,'pending')`,
    [wardLogId, teacherId, requesterStudentId, buddyStudentId],
  );
}

/** طلبات تأكيد مراجعة بانتظار ردّ هذا الطالب — لبطاقة الرئيسية. اسم الطالب الذي طلب + التاريخ فقط، لا شيء من ورده */
export async function listPendingBuddyRequestsForStudent(
  teacherId: number,
  studentId: string,
): Promise<BuddyRequest[]> {
  const rows = await db().sql`
    SELECT b.ward_log_id, rs.name AS requester_name, w.date
    FROM ward_review_buddies b
    JOIN ward_logs w ON w.id = b.ward_log_id
    JOIN students rs ON rs.teacher_id = b.teacher_id AND rs.id = b.requester_student_id
    WHERE b.teacher_id = ${teacherId} AND b.buddy_student_id = ${studentId} AND b.status = 'pending'
    ORDER BY w.date DESC, b.id DESC
  `;
  return rows.map((r) => ({
    wardLogId: r.ward_log_id as number,
    requesterName: r.requester_name as string,
    date: r.date as string,
  }));
}

/**
 * يؤكّد أو يرفض الزميل المقصود طلب مراجعة — مقفل بالضبط على
 * (buddy_student_id = هذا الطالب) و(status = 'pending') داخل جملة
 * UPDATE نفسها: أي طالب ثالث أو طلب مستجاب عليه مسبقاً يرجع false (404
 * بالمسار)، لا 403/400 يكشف وجود الصف من عدمه.
 */
export async function respondToBuddyRequest(
  teacherId: number,
  studentId: string,
  wardLogId: number,
  accept: boolean,
): Promise<boolean> {
  const rows = await db().sql`
    UPDATE ward_review_buddies
    SET status = ${accept ? "confirmed" : "declined"}, responded_at = now()
    WHERE ward_log_id = ${wardLogId} AND teacher_id = ${teacherId}
      AND buddy_student_id = ${studentId} AND status = 'pending'
    RETURNING id
  `;
  return rows.length > 0;
}

/** وارد المعلّم — كل الأوراد أو الجديدة فقط، الأحدث أولاً */
export async function listWardLogs(teacherId: number, onlyNew = false): Promise<WardLog[]> {
  const rows = onlyNew
    ? await db().sql`
        SELECT w.id, w.student_id, s.name AS student_name, w.date,
               w.hifz_from, w.hifz_to, w.review_from, w.review_to,
               w.hifz_from_surah, w.hifz_from_ayah, w.hifz_to_surah, w.hifz_to_ayah,
               w.review_from_surah, w.review_from_ayah, w.review_to_surah, w.review_to_ayah,
               w.note, w.status, w.created_at,
               w.previous_attempt_id, w.reviewed_by, w.reviewed_at, w.review_note,
               w.error_counts, w.error_score, w.error_band,
           (SELECT json_agg(
              json_build_object(
                'fromSurah', rs.from_surah, 'fromAyah', rs.from_ayah,
                'toSurah', rs.to_surah, 'toAyah', rs.to_ayah,
                'fromPage', rs.from_page, 'toPage', rs.to_page, 'track', rs.track
              ) ORDER BY rs.segment_order
            )::text
            FROM ward_review_segments rs WHERE rs.ward_log_id = w.id
           ) AS review_segments_json,
           (SELECT json_build_object('studentId', b.buddy_student_id, 'name', bs.name, 'status', b.status)::text
            FROM ward_review_buddies b JOIN students bs ON bs.teacher_id = b.teacher_id AND bs.id = b.buddy_student_id
            WHERE b.ward_log_id = w.id
           ) AS buddy_json
        FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
        WHERE w.teacher_id = ${teacherId} AND w.status = 'new'
        ORDER BY w.created_at DESC, w.id DESC
      `
    : await db().sql`
        SELECT w.id, w.student_id, s.name AS student_name, w.date,
               w.hifz_from, w.hifz_to, w.review_from, w.review_to,
               w.hifz_from_surah, w.hifz_from_ayah, w.hifz_to_surah, w.hifz_to_ayah,
               w.review_from_surah, w.review_from_ayah, w.review_to_surah, w.review_to_ayah,
               w.note, w.status, w.created_at,
               w.previous_attempt_id, w.reviewed_by, w.reviewed_at, w.review_note,
               w.error_counts, w.error_score, w.error_band,
           (SELECT json_agg(
              json_build_object(
                'fromSurah', rs.from_surah, 'fromAyah', rs.from_ayah,
                'toSurah', rs.to_surah, 'toAyah', rs.to_ayah,
                'fromPage', rs.from_page, 'toPage', rs.to_page, 'track', rs.track
              ) ORDER BY rs.segment_order
            )::text
            FROM ward_review_segments rs WHERE rs.ward_log_id = w.id
           ) AS review_segments_json,
           (SELECT json_build_object('studentId', b.buddy_student_id, 'name', bs.name, 'status', b.status)::text
            FROM ward_review_buddies b JOIN students bs ON bs.teacher_id = b.teacher_id AND bs.id = b.buddy_student_id
            WHERE b.ward_log_id = w.id
           ) AS buddy_json
        FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
        WHERE w.teacher_id = ${teacherId}
        ORDER BY w.created_at DESC, w.id DESC
      `;
  return rows.map(rowToWard);
}

/** الأوراد المعتمدة فقط لحلقة — للتقارير الرسمية (لا تدخل أوراد new/seen/needs_revision في أي حساب) */
export async function listApprovedWardLogs(teacherId: number): Promise<WardLog[]> {
  const rows = await db().sql`
    SELECT w.id, w.student_id, s.name AS student_name, w.date,
           w.hifz_from, w.hifz_to, w.review_from, w.review_to,
               w.hifz_from_surah, w.hifz_from_ayah, w.hifz_to_surah, w.hifz_to_ayah,
               w.review_from_surah, w.review_from_ayah, w.review_to_surah, w.review_to_ayah,
           w.note, w.status, w.created_at,
           w.previous_attempt_id, w.reviewed_by, w.reviewed_at, w.review_note,
               w.error_counts, w.error_score, w.error_band,
           (SELECT json_agg(
              json_build_object(
                'fromSurah', rs.from_surah, 'fromAyah', rs.from_ayah,
                'toSurah', rs.to_surah, 'toAyah', rs.to_ayah,
                'fromPage', rs.from_page, 'toPage', rs.to_page, 'track', rs.track
              ) ORDER BY rs.segment_order
            )::text
            FROM ward_review_segments rs WHERE rs.ward_log_id = w.id
           ) AS review_segments_json
    FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
    WHERE w.teacher_id = ${teacherId} AND w.status = 'approved'
    ORDER BY w.created_at DESC, w.id DESC
  `;
  return rows.map(rowToWard);
}

/** أوراد طالب بعينه — لعرض سجلّه في صفحته */
export async function listWardLogsForStudent(teacherId: number, studentId: string): Promise<WardLog[]> {
  const rows = await db().sql`
    SELECT w.id, w.student_id, s.name AS student_name, w.date,
           w.hifz_from, w.hifz_to, w.review_from, w.review_to,
               w.hifz_from_surah, w.hifz_from_ayah, w.hifz_to_surah, w.hifz_to_ayah,
               w.review_from_surah, w.review_from_ayah, w.review_to_surah, w.review_to_ayah,
           w.note, w.status, w.created_at,
           w.previous_attempt_id, w.reviewed_by, w.reviewed_at, w.review_note,
               w.error_counts, w.error_score, w.error_band,
           (SELECT json_agg(
              json_build_object(
                'fromSurah', rs.from_surah, 'fromAyah', rs.from_ayah,
                'toSurah', rs.to_surah, 'toAyah', rs.to_ayah,
                'fromPage', rs.from_page, 'toPage', rs.to_page, 'track', rs.track
              ) ORDER BY rs.segment_order
            )::text
            FROM ward_review_segments rs WHERE rs.ward_log_id = w.id
           ) AS review_segments_json,
           (SELECT json_build_object('studentId', b.buddy_student_id, 'name', bs.name, 'status', b.status)::text
            FROM ward_review_buddies b JOIN students bs ON bs.teacher_id = b.teacher_id AND bs.id = b.buddy_student_id
            WHERE b.ward_log_id = w.id
           ) AS buddy_json
    FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
    WHERE w.teacher_id = ${teacherId} AND w.student_id = ${studentId}
    ORDER BY w.created_at DESC, w.id DESC
    LIMIT 30
  `;
  return rows.map(rowToWard);
}

/**
 * كل أوراد طالب بعينه بلا سقف (STEP 53) — لحساب السجلّ الشهري الذي
 * يحتاج التاريخ الكامل، لا آخر ٣٠ ورداً فقط كما في listWardLogsForStudent
 * (تلك مخصَّصة لقائمة "أورادي الأخيرة" بالواجهة).
 */
export async function listAllWardLogsForStudent(teacherId: number, studentId: string): Promise<WardLog[]> {
  const rows = await db().sql`
    SELECT w.id, w.student_id, s.name AS student_name, w.date,
           w.hifz_from, w.hifz_to, w.review_from, w.review_to,
               w.hifz_from_surah, w.hifz_from_ayah, w.hifz_to_surah, w.hifz_to_ayah,
               w.review_from_surah, w.review_from_ayah, w.review_to_surah, w.review_to_ayah,
           w.note, w.status, w.created_at,
           w.previous_attempt_id, w.reviewed_by, w.reviewed_at, w.review_note,
               w.error_counts, w.error_score, w.error_band,
           (SELECT json_agg(
              json_build_object(
                'fromSurah', rs.from_surah, 'fromAyah', rs.from_ayah,
                'toSurah', rs.to_surah, 'toAyah', rs.to_ayah,
                'fromPage', rs.from_page, 'toPage', rs.to_page, 'track', rs.track
              ) ORDER BY rs.segment_order
            )::text
            FROM ward_review_segments rs WHERE rs.ward_log_id = w.id
           ) AS review_segments_json
    FROM ward_logs w JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id
    WHERE w.teacher_id = ${teacherId} AND w.student_id = ${studentId}
    ORDER BY w.date DESC, w.id DESC
  `;
  return rows.map(rowToWard);
}

/**
 * يغيّر حالة ورد. عند needs_revision: يتطلّب ملاحظة غير فارغة، يسجّل
 * reviewed_by/reviewed_at، ويرفض التحويل لو كانت الحالة الحالية approved
 * (لا رجوع عن اعتماد). عند approved: يسجّل reviewed_by/reviewed_at أيضاً
 * (قرار مراجعة حقيقي). عند أي حالة أخرى (seen): يبقى السلوك القديم كما هو
 * تماماً بلا لمس.
 */
export async function setWardLogStatus(
  teacherId: number,
  id: number,
  status: WardStatus,
  actingTeacherId?: number,
  reviewNote?: string,
): Promise<{
  studentId: string;
  /** عند الاعتماد فقط: لحمولة حدث الويب هوك progress.approved */
  log?: { date: string; hifzAyah: AyahRange | null; reviewAyah: AyahRange | null };
} | null> {
  if (status === "needs_revision") {
    const note = reviewNote?.trim();
    if (!note) throw new Error("ملاحظة المراجعة مطلوبة عند طلب الإعادة");
    const rows = await db().sql`
      UPDATE ward_logs
      SET status = 'needs_revision', reviewed_by = ${actingTeacherId ?? null},
          reviewed_at = ${new Date().toISOString()}, review_note = ${note}
      WHERE teacher_id = ${teacherId} AND id = ${id} AND status <> 'approved'
      RETURNING student_id
    `;
    return rows.length > 0 ? { studentId: rows[0].student_id as string } : null;
  }

  if (status === "approved") {
    const rows = await db().sql`
      UPDATE ward_logs
      SET status = 'approved', reviewed_by = ${actingTeacherId ?? null}, reviewed_at = ${new Date().toISOString()}
      WHERE teacher_id = ${teacherId} AND id = ${id}
      RETURNING student_id, date,
        hifz_from_surah, hifz_from_ayah, hifz_to_surah, hifz_to_ayah,
        review_from_surah, review_from_ayah, review_to_surah, review_to_ayah
    `;
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      studentId: r.student_id as string,
      log: {
        date: String(r.date).slice(0, 10),
        hifzAyah: ayahRangeFromRow(r, "hifz_from_surah", "hifz_from_ayah", "hifz_to_surah", "hifz_to_ayah"),
        reviewAyah: ayahRangeFromRow(r, "review_from_surah", "review_from_ayah", "review_to_surah", "review_to_ayah"),
      },
    };
  }

  const rows = await db().sql`
    UPDATE ward_logs SET status = ${status}
    WHERE teacher_id = ${teacherId} AND id = ${id}
    RETURNING student_id
  `;
  return rows.length > 0 ? { studentId: rows[0].student_id as string } : null;
}

export async function countNewWards(teacherId: number): Promise<number> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM ward_logs WHERE teacher_id = ${teacherId} AND status = 'new'
  `;
  return Number(rows[0].n);
}

/**
 * يعيد المعلّم تصنيف مقاطع مراجعة ورد قائم (B3) — مصفوفة كاملة بعدد
 * المقاطع نفسه، كل عنصر كبرى/صغرى أو null للمقطع بلا تصنيف. مسموح فقط
 * ما دام الورد لم يُتّخذ فيه قرار بعد (new/seen — نفس قفل تعديل الطالب):
 * التصنيف جزء من محتوى الورد قبل الاعتماد. يعيد "not_found" لورد غير
 * مملوك لهذه الحلقة، و"locked" لو اكتمل/رُفض، و"count_mismatch" لو لم
 * يطابق العددُ مقاطع الورد الفعلية، و"ok" عند النجاح.
 */
export async function setWardReviewTracks(
  teacherId: number,
  id: number,
  tracks: (ReviewTrack | null)[],
): Promise<"ok" | "not_found" | "locked" | "count_mismatch"> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const ward = await client.query<{ status: string }>(
      `SELECT status FROM ward_logs WHERE id = $1 AND teacher_id = $2 FOR UPDATE`,
      [id, teacherId],
    );
    if (ward.rows.length === 0) {
      await client.query("ROLLBACK");
      return "not_found";
    }
    if (ward.rows[0].status !== "new" && ward.rows[0].status !== "seen") {
      await client.query("ROLLBACK");
      return "locked";
    }
    const existing = await client.query<{ segment_order: number }>(
      `SELECT segment_order FROM ward_review_segments WHERE ward_log_id = $1 ORDER BY segment_order`,
      [id],
    );
    if (existing.rows.length !== tracks.length) {
      await client.query("ROLLBACK");
      return "count_mismatch";
    }
    for (const [i, track] of tracks.entries()) {
      await client.query(`UPDATE ward_review_segments SET track = $1 WHERE ward_log_id = $2 AND segment_order = $3`, [
        track,
        id,
        i + 1,
      ]);
    }
    await client.query("COMMIT");
    return "ok";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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

/** حذف مشروط بمالك الاشتراك — endpoint وحده لا يكفي (أي معلّم آخر يستطيع إرساله) */
export async function deletePushSubscription(teacherId: number, endpoint: string): Promise<void> {
  await db().sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint} AND teacher_id = ${teacherId}`;
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

// ————— اشتراكات إشعارات الطالب (STEP 54) — جدول مستقل عن push_subscriptions —————

export async function saveStudentPushSubscription(
  teacherId: number,
  studentId: string,
  sub: PushSubscriptionData,
): Promise<void> {
  await db().sql`
    INSERT INTO student_push_subscriptions (teacher_id, student_id, endpoint, p256dh, auth)
    VALUES (${teacherId}, ${studentId}, ${sub.endpoint}, ${sub.p256dh}, ${sub.auth})
    ON CONFLICT (endpoint) DO UPDATE SET
      teacher_id = excluded.teacher_id,
      student_id = excluded.student_id,
      p256dh = excluded.p256dh,
      auth = excluded.auth
  `;
}

/** حذف مشروط بمالك الاشتراك (الحلقة والطالب) — endpoint وحده لا يكفي */
export async function deleteStudentPushSubscription(
  teacherId: number,
  studentId: string,
  endpoint: string,
): Promise<void> {
  await db().sql`
    DELETE FROM student_push_subscriptions
    WHERE endpoint = ${endpoint} AND teacher_id = ${teacherId} AND student_id = ${studentId}
  `;
}

/** اشتراكات جهاز طالب بعينه — لإشعار فوري عند اعتماد/رفض ورده */
export async function listStudentPushSubscriptions(
  teacherId: number,
  studentId: string,
): Promise<PushSubscriptionData[]> {
  const rows = await db().sql`
    SELECT endpoint, p256dh, auth FROM student_push_subscriptions
    WHERE teacher_id = ${teacherId} AND student_id = ${studentId}
  `;
  return rows.map((r) => ({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }));
}

export async function markStudentPushSubscriptionSuccess(endpoint: string): Promise<void> {
  await db().sql`
    UPDATE student_push_subscriptions SET last_success_at = now() WHERE endpoint = ${endpoint}
  `;
}

export type StudentPushReminderRow = {
  teacherId: number;
  studentId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  hasWardToday: boolean;
};

/**
 * كل اشتراكات الطلاب مع علامة هل لهذا الطالب ورد اليوم (بالتاريخ
 * المُمرَّر — يُحسب بتوقيت الرياض في المستدعي، lib/riyadh-date.ts).
 * تُرجَع الحالتان معاً (لا نُرشَّح مسبقاً) ليحسب المستدعي "sent/skipped"
 * بدقة بدل مجرد قائمة من سيُرسَل لهم.
 */
export async function listStudentPushSubscriptionsForReminder(today: string): Promise<StudentPushReminderRow[]> {
  const rows = await db().sql`
    SELECT sps.teacher_id, sps.student_id, sps.endpoint, sps.p256dh, sps.auth,
           EXISTS (
             SELECT 1 FROM ward_logs w
             WHERE w.teacher_id = sps.teacher_id AND w.student_id = sps.student_id AND w.date = ${today}
           ) AS has_ward_today
    FROM student_push_subscriptions sps
    JOIN students s ON s.teacher_id = sps.teacher_id AND s.id = sps.student_id
    WHERE s.active = TRUE AND s.deleted_at IS NULL
  `;
  return rows.map((r) => ({
    teacherId: r.teacher_id as number,
    studentId: r.student_id as string,
    endpoint: r.endpoint as string,
    p256dh: r.p256dh as string,
    auth: r.auth as string,
    hasWardToday: r.has_ward_today as boolean,
  }));
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
): Promise<{ id: number; teacherName: string; username: string; role: TeacherRole; deactivatedAt: string | null }[]> {
  const rows = await db().sql`
    SELECT id, teacher_name, username, role, deactivated_at FROM teachers
    WHERE halaqah_id = ${halaqahId} ORDER BY (role = 'supervisor') DESC, created_at
  `;
  return rows.map((r) => ({
    id: r.id as number,
    teacherName: (r.teacher_name as string) || (r.username as string),
    username: r.username as string,
    role: (r.role as TeacherRole) ?? "assistant",
    deactivatedAt: (r.deactivated_at as string | null) ?? null,
  }));
}

// ————— إيقاف المساعد وتفعيله (STEP 60) —————
// لا حذف أبداً: الإيقاف طابع زمني فقط، فبيانات المساعد وأفعاله الماضية
// (أوراد اعتمدها، مراجعات…) تبقى كلها. شرط role = 'assistant' بالجملة
// نفسها يستثني المشرفين جميعاً — ومنهم المستدعي نفسه (لا إيقاف للذات)،
// لأن هذا المسار مقصور على المشرفين أصلاً فكل مستهدف مشرف هو "مشرف آخر".

/**
 * يوقف مساعداً أو يعيد تفعيله. الإيقاف يرفع نسخة الجلسة أيضاً فتسقط
 * جلساته القائمة فوراً حتى قبل أول فحص deactivated_at؛ التفعيل يعيد
 * العمود NULL فقط. يرجع false لو الهدف ليس مساعداً بهذي الحلقة بالضبط
 * (مشرف — ومنه المستدعي نفسه — أو معرّف حلقة أخرى) → 404 بالمسار.
 */
export async function setAssistantActive(halaqahId: number, assistantId: number, active: boolean): Promise<boolean> {
  const rows = active
    ? await db().sql`
        UPDATE teachers SET deactivated_at = NULL
        WHERE id = ${assistantId} AND halaqah_id = ${halaqahId} AND role = 'assistant'
        RETURNING id
      `
    : await db().sql`
        UPDATE teachers SET deactivated_at = now(), session_version = session_version + 1
        WHERE id = ${assistantId} AND halaqah_id = ${halaqahId} AND role = 'assistant'
        RETURNING id
      `;
  // M5: عضوية الهوية تتبع حالة الحساب — أفضل جهد لا أكثر: التحقق الفعلي
  // عند أي تبديل دور يقرأ صف المعلّم الحي، فبقاء العلم قديماً لا يفتح شيئاً.
  if (rows.length > 0) {
    await db().sql`
      UPDATE memberships SET active = ${active}
      WHERE legacy_kind = 'teacher' AND legacy_id = ${String(assistantId)}
    `;
  }
  return rows.length > 0;
}

/** خيار الحلقة: إعادة طلب تأكيد الزميل عند تعديل الورد — يقرؤه المسار والمعلّمون جميعاً */
export async function halaqahBuddyResetOnEdit(halaqahId: number): Promise<boolean> {
  const rows = await db().sql`SELECT buddy_reset_on_edit FROM halaqahs WHERE id = ${halaqahId}`;
  return rows[0]?.buddy_reset_on_edit === true;
}

/** يغيّر خيار إعادة تأكيد الزميل — المسار يقصر الاستدعاء على مشرف الحلقة */
export async function setHalaqahBuddyResetOnEdit(halaqahId: number, enabled: boolean): Promise<void> {
  await db().sql`UPDATE halaqahs SET buddy_reset_on_edit = ${enabled} WHERE id = ${halaqahId}`;
}

/** خيار الحلقة: إظهار زملاء الحلقة للطلاب — الافتراض مخفي */
export async function halaqahClassmatesVisible(halaqahId: number): Promise<boolean> {
  const rows = await db().sql`SELECT classmates_visible FROM halaqahs WHERE id = ${halaqahId}`;
  return rows[0]?.classmates_visible === true;
}

/** يغيّر إظهار الزملاء — المسار يقصر الاستدعاء على معلّم الحلقة من جلسته */
export async function setHalaqahClassmatesVisible(halaqahId: number, enabled: boolean): Promise<void> {
  await db().sql`UPDATE halaqahs SET classmates_visible = ${enabled} WHERE id = ${halaqahId}`;
}

/**
 * أسماء طلاب الحلقة فقط، مرتّبة بالاسم — لا أي عمود آخر عمداً (لا هاتف ولا
 * ولي أمر ولا درجات). يقرأ حلقة الطالب من جلسته فلا يوجد معامل عميل.
 */
export async function listClassmateNames(halaqahId: number): Promise<string[]> {
  const rows = await db().sql`
    SELECT name FROM students
    WHERE teacher_id = ${halaqahId} AND deleted_at IS NULL
    ORDER BY name
  `;
  return rows.map((row) => String(row.name));
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

// ————— دخول Google للطالب (STEP 6A — مسار "طالب جديد" فقط) —————
// اسم مختلف عمداً عن StudentAccount/findStudentAccount أعلاه (شكل جلسة
// الطالب الحالية) لتفادي التصادم اللفظي مع جدول student_accounts نفسه.
// provider_subject (Google sub) هو مفتاح المطابقة الوحيد؛ provider_email
// لا يظهر في أي WHERE — للعرض فقط.

export type GoogleStudentAccount = { halaqahId: number; studentId: string };

/** يبحث عن حساب طالب مرتبط مسبقاً بهذا الـ sub — لا علاقة للبريد بالمطابقة */
export async function findGoogleStudentAccount(providerSubject: string): Promise<GoogleStudentAccount | null> {
  const rows = await db().sql`
    SELECT halaqah_id, student_id FROM student_accounts
    WHERE provider = 'google' AND provider_subject = ${providerSubject}
  `;
  const row = rows[0];
  return row ? { halaqahId: row.halaqah_id as number, studentId: row.student_id as string } : null;
}

export type NewGoogleStudent = {
  inviteCode: string;
  studentName: string;
  providerSubject: string;
  providerEmail: string;
};

/**
 * ينشئ السجل الأكاديمي (students) وحساب دخول جوجل (student_accounts) معاً
 * بعملية واحدة ذرّية — لا حالة وسطى ممكنة فيها أحدهما بلا الآخر. يتحقق من
 * رمز الدعوة أولاً عبر findHalaqahByInviteCode الحالية (بلا اختراع نظام
 * دعوات جديد). يرجع null فقط لو رمز الدعوة غير صحيح؛ أي خطأ آخر (مثل
 * تكرار provider_subject تحت UNIQUE) يُرجع الترانزاكشن بالكامل ويُرمى.
 */
export async function createGoogleStudentAccount(
  input: NewGoogleStudent,
): Promise<GoogleStudentAccount | null> {
  const halaqah = await findHalaqahByInviteCode(input.inviteCode);
  if (!halaqah) return null;

  const studentId = randomBytes(12).toString("hex");
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO students (id, teacher_id, name, group_name, ranges, mastery, active, rating, sort_order, created_at)
       VALUES ($1, $2, $3, '', '[]', '{}', true, 0, 0, now())`,
      [studentId, halaqah.id, input.studentName],
    );
    await client.query(
      `INSERT INTO student_accounts (halaqah_id, student_id, provider, provider_subject, provider_email)
       VALUES ($1, $2, 'google', $3, $4)`,
      [halaqah.id, studentId, input.providerSubject, input.providerEmail],
    );
    // M5: طالب جوجل جديد = صاحب دخول، فيُنشأ معه user+membership بنفس الترانزاكشن
    await ensureStudentIdentity(client, {
      halaqahId: halaqah.id,
      id: studentId,
      name: input.studentName,
      username: null,
      active: true,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return { halaqahId: halaqah.id, studentId };
}

// ————— ربط طالب موجود مسبقاً بحساب Google (STEP 6B) —————
// منفصل تماماً عن "طالب جديد" أعلاه: هنا لا يُنشأ أي صف بجدول students
// إطلاقاً — الرمز يربط sub بطالب أكاديمي قائم فعلاً. أسماء الدوال/الأنواع
// مختلفة عمداً عن GoogleStudentAccount/findStudentAccount لتفادي أي تصادم
// لفظي مع ما هو موجود بالفعل.

const STUDENT_LINK_TOKEN_TTL_HOURS = 24; // مدة صلاحية رمز الربط — ثابت واحد سهل التعديل

export type NewStudentLinkToken = {
  halaqahId: number;
  studentId: string;
  createdByType: "teacher";
  createdById: number;
};

export type StudentLinkTokenIssued = { token: string; expiresAt: string };

/**
 * يصدر رمز ربط لمرة واحدة لطالب داخل الحلقة المحدَّدة. halaqahId يجب أن
 * يأتي من جلسة المُصدِر (لا من مدخلات عميل غير موثوقة) — يتحقق من ذلك
 * المستدعي في طبقة الـAPI. لا حاجة لاستعلام تحقّق منفصل عن وجود الطالب:
 * الـFK المركّب (halaqah_id, student_id) → students(teacher_id, id) يرفض
 * الإدراج تلقائياً لو الطالب لا ينتمي فعلاً لهذي الحلقة (23503)، فنترجمها
 * هنا لـ null بدل تسريب خطأ قاعدة بيانات خام للمستدعي.
 */
export async function createStudentGoogleLinkToken(
  input: NewStudentLinkToken,
): Promise<StudentLinkTokenIssued | null> {
  const token = randomBytes(20).toString("base64url"); // ١٦٠ بت إنتروبيا
  const expiresAt = new Date(Date.now() + STUDENT_LINK_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  try {
    await db().sql`
      INSERT INTO student_google_link_tokens
        (halaqah_id, student_id, token_hash, created_by_type, created_by_id, expires_at)
      VALUES (
        ${input.halaqahId}, ${input.studentId}, ${hashToken(token)},
        ${input.createdByType}, ${input.createdById}, ${expiresAt.toISOString()}
      )
    `;
  } catch (error) {
    // db().sql (خلافاً لعميل pg الخام) يغلّف خطأ Postgres الحقيقي بـ.cause
    // بدل وضع code مباشرة على الخطأ نفسه — نتحقق من الموضعين.
    const err = error as { code?: string; cause?: { code?: string } } | null;
    const code = err?.code ?? err?.cause?.code;
    if (code === "23503") return null; // الطالب لا ينتمي لهذي الحلقة، أو غير موجود
    throw error;
  }

  return { token, expiresAt: expiresAt.toISOString() };
}

export type StudentGoogleLinkResult =
  | { ok: true; halaqahId: number; studentId: string }
  | { ok: false; reason: "invalid_token" }
  | { ok: false; reason: "sub_already_linked" };

/**
 * يستهلك رمز الربط ويربط sub بالطالب المرتبط به — بعملية ذرّية واحدة:
 * UPDATE شرطي (used_at IS NULL AND expires_at > now()) يستهلك الرمز
 * ويُرجع هوية الطالب، ثم INSERT في student_accounts يعتمد كلياً على
 * UNIQUE(provider, provider_subject) لمنع ربط نفس sub بطالبين. أي فشل
 * (رمز غير صالح، أو sub مرتبط مسبقاً بطالب آخر) يُرجع الترانزاكشن
 * بالكامل — فيعود used_at للرمز إلى NULL تلقائياً، ويبقى صالحاً لمحاولة
 * لاحقة بحساب Google صحيح.
 */
export async function consumeStudentGoogleLinkToken(
  rawToken: string,
  providerSubject: string,
  providerEmail: string,
): Promise<StudentGoogleLinkResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");

    const consumed = await client.query(
      `UPDATE student_google_link_tokens
       SET used_at = now(), used_provider_subject = $1
       WHERE token_hash = $2 AND used_at IS NULL AND expires_at > now()
       RETURNING halaqah_id, student_id`,
      [providerSubject, hashToken(rawToken)],
    );
    if (consumed.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "invalid_token" };
    }
    const halaqahId = consumed.rows[0].halaqah_id as number;
    const studentId = consumed.rows[0].student_id as string;

    try {
      await client.query(
        `INSERT INTO student_accounts (halaqah_id, student_id, provider, provider_subject, provider_email)
         VALUES ($1, $2, 'google', $3, $4)`,
        [halaqahId, studentId, providerSubject, providerEmail],
      );
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      await client.query("ROLLBACK");
      if (code === "23505") return { ok: false, reason: "sub_already_linked" };
      throw error;
    }

    await client.query("COMMIT");
    return { ok: true, halaqahId, studentId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ————— حماية مسار ربط الطالب من الإساءة (STEP 6B) —————
// معدّل مستقل تماماً عن register_attempts — ذاك خاص بتسجيل حساب معلّم
// جديد، وخلطهما بنفس العدّاد يجعل نشاط أحد المسارين يستهلك حصة الآخر
// لنفس الـIP بلا أي علاقة منطقية بينهما.

const STUDENT_LINK_ATTEMPT_LIMIT = 5;
const STUDENT_LINK_ATTEMPT_WINDOW_MINUTES = 60;

/** يسجّل محاولة ربط جديدة من هذا العنوان، ويرجع true لو مسموح إتمامها */
export async function checkStudentLinkRateLimit(ip: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM student_link_attempts
    WHERE ip = ${ip} AND created_at > now() - (${STUDENT_LINK_ATTEMPT_WINDOW_MINUTES} || ' minutes')::interval
  `;
  const count = Number(rows[0]?.n ?? 0);
  await db().sql`INSERT INTO student_link_attempts (ip) VALUES (${ip})`;
  return count < STUDENT_LINK_ATTEMPT_LIMIT;
}

// ————— حماية دخول المعلّم والطالب من brute-force (STEP 6C) —————
// جدول مستقل تماماً عن register_attempts/student_link_attempts. خلافاً
// لهما، يُسجَّل صف هنا فقط عند فشل محاولة الدخول (كلمة مرور خاطئة) —
// الدخول الناجح لا يُستهلك من الحصة إطلاقاً ولا يُسجَّل، حتى لو كان
// نجاحاً بعد محاولات فاشلة سابقة من نفس الـIP.

const LOGIN_ATTEMPT_LIMIT = 5;
const LOGIN_ATTEMPT_WINDOW_MINUTES = 60;

/** يفحص فقط بلا تسجيل — هل عدد محاولات الدخول الفاشلة من هذا الـIP خلال الساعة الماضية دون الحد؟ */
export async function checkLoginRateLimit(ip: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM login_attempts
    WHERE ip = ${ip} AND created_at > now() - (${LOGIN_ATTEMPT_WINDOW_MINUTES} || ' minutes')::interval
  `;
  return Number(rows[0]?.n ?? 0) < LOGIN_ATTEMPT_LIMIT;
}

/** يسجّل محاولة دخول فاشلة — يُستدعى فقط بعد فشل التحقق من كلمة المرور */
export async function recordFailedLoginAttempt(ip: string): Promise<void> {
  await db().sql`INSERT INTO login_attempts (ip) VALUES (${ip})`;
}

// ————— حماية POST /api/admin/login من brute-force (STEP 6E — M1) —————
// جدول مستقل تماماً عن login_attempts — نفس المبدأ حرفياً: تسجيل فقط
// عند فشل المقارنة، النجاح لا يُستهلك من الحصة.

const ADMIN_LOGIN_ATTEMPT_LIMIT = 5;
const ADMIN_LOGIN_ATTEMPT_WINDOW_MINUTES = 60;

/** يفحص فقط بلا تسجيل — هل عدد محاولات دخول الأدمن الفاشلة من هذا الـIP خلال الساعة الماضية دون الحد؟ */
export async function checkAdminLoginRateLimit(ip: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM admin_login_attempts
    WHERE ip = ${ip} AND created_at > now() - (${ADMIN_LOGIN_ATTEMPT_WINDOW_MINUTES} || ' minutes')::interval
  `;
  return Number(rows[0]?.n ?? 0) < ADMIN_LOGIN_ATTEMPT_LIMIT;
}

/** يسجّل محاولة دخول أدمن فاشلة — يُستدعى فقط بعد فشل مقارنة ADMIN_SECRET */
export async function recordFailedAdminLoginAttempt(ip: string): Promise<void> {
  await db().sql`INSERT INTO admin_login_attempts (ip) VALUES (${ip})`;
}

// ————— حماية المسارات الستة تحت /api/link من الفيضان (STEP 29 — F-02 Tier 1) —————
// جدول مستقل تماماً (link_attempts) — العدّ على ip وحده (لا endpoint):
// المستدعي الشرعي لا يُسجَّل عليه صف إطلاقاً (يحمل السرّ الصحيح دائماً)،
// فلا false positive نحميه بتفريق الحصص، والمهاجم بلا سرّ لا يهمّه أي
// مسار يقصف فلا مبرر لمنحه ٦× الميزانية بتفريقها. endpoint يُسجَّل بكل
// صف لغرض تحقيقي فقط (أي مسار استُهدف)، لا يدخل حساب العدّ.
//
// الاستدعاء إلزامي بهذا الترتيب (مُطبَّق بـlib/link-auth.ts، لا يُترَك
// لكل route): افحص أولاً بـcheckLinkRateLimit — لو تجاوز، أرجع 429
// مباشرة بلا استدعاء recordFailedLinkAttempt إطلاقاً. لو لم يتجاوز،
// استدعِ recordFailedLinkAttempt ثم أرجع 401. هذا يجعل نموّ الجدول
// محدوداً بحد أقصى ~LINK_ATTEMPT_LIMIT صف لكل IP لكل نافذة مهما طال
// القصف، ويوفّر نصف كلفة DB على كل طلب مقصوف بعد التجاوز. (سباق
// check-then-insert غير ذرّي: دفعة متزامنة قد تُدخل أكثر من الحدّ صفاً
// واحدة، لكن الدفعة التالية تقرأ العدّاد المرتفع وتتوقف فوراً — النموّ
// محدود ويصحّح نفسه ذاتياً؛ الذرّية شرط لطبقة السقف المصادَق المؤجَّلة
// [Tier 2]، لا لهذه الطبقة.)

const LINK_ATTEMPT_LIMIT = 10;
const LINK_ATTEMPT_WINDOW_MINUTES = 60;

/** يفحص فقط بلا تسجيل — هل عدد محاولات فشل السرّ من هذا الـIP عبر كل مسارات /api/link خلال الساعة الماضية دون الحد؟ */
export async function checkLinkRateLimit(ip: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM link_attempts
    WHERE ip = ${ip} AND created_at > now() - (${LINK_ATTEMPT_WINDOW_MINUTES} || ' minutes')::interval
  `;
  return Number(rows[0]?.n ?? 0) < LINK_ATTEMPT_LIMIT;
}

/** يسجّل محاولة فاشلة لمسار معيّن — يُستدعى فقط بعد فشل مطابقة x-link-secret وبعد التأكد من عدم التجاوز */
export async function recordFailedLinkAttempt(ip: string, endpoint: string): Promise<void> {
  await db().sql`INSERT INTO link_attempts (ip, endpoint) VALUES (${ip}, ${endpoint})`;
}

// ————— حماية مسارَي تخمين رموز الدعوة بلا LINK_SECRET (STEP 33) —————
// complete-invite (invite_code) وjoin-info (teacher_invite_code)، كلاهما
// ٤٠ بت بلا أي سرّ مشترك يحميهما. جدول مستقل (invite_attempts) — العدّ
// على ip وحده (لا endpoint): كلا المسارين يخمّن نفس نوع الغرض، وتفريق
// الحصة بينهما يمنح المهاجم ضِعف الميزانية بلا مكسب. خلافاً لـ
// link_attempts (STEP 29)، مستخدم شرعي *يمكن* أن يفشل هنا فعلاً (خطأ
// طباعي، رابط معلّم قديم) — العتبة مبنية على ذلك، لا على استحالته.
//
// العتبة ٣٠ مشتقّة من ذروة تسجيل جماعي على IP مشترك، لا من فشل مستخدم
// فرد — الدلو هنا لكل IP لا لكل شخص: معلّم يوزّع رابط الدعوة على حلقته
// (٣٠-٥٠ طالباً على واي‑فاي مسجد واحد أو خلف نفس CGNAT)، كل طالب يكتب
// ١٠ محارف hex يدوياً بجوّاله بمعدّل خطأ ~٢٠-٣٠٪ من أول محاولة — ٥٠
// طالباً × ٢٥٪ ≈ ١٢-٢٠ فشلاً بذروة التسجيل الجماعي وحدها، فأُضيف هامش
// فوقها. هذا الحدّ **دفاع في العمق** يكبح المسح الآلي ويحدّ استهلاك
// الموارد — وليس ما يجعل التخمين غير عملي أصلاً؛ ذاك دور الـ٤٠ بت
// وكلفة دورة OAuth كاملة لكل محاولة على complete-invite (STEP 31).
//
// الاستدعاء إلزامي بنفس ترتيب link_attempts: افحص أولاً بـ
// checkInviteRateLimit — لو تجاوز، أرجع 429 مباشرة بلا استدعاء
// recordFailedInviteAttempt إطلاقاً. لو لم يتجاوز، استدعِ
// recordFailedInviteAttempt بعد التأكد من عدم التجاوز ثم أرجع الرد
// الأصلي (404). سباق check-then-insert غير ذرّي عمداً — نفس تبرير
// link_attempts، غير مطلوب هنا.

const INVITE_ATTEMPT_LIMIT = 30;
const INVITE_ATTEMPT_WINDOW_MINUTES = 60;

/** يفحص فقط بلا تسجيل — هل عدد محاولات فشل رمز الدعوة من هذا الـIP عبر كلا المسارين خلال الساعة الماضية دون الحد؟ */
export async function checkInviteRateLimit(ip: string): Promise<boolean> {
  const rows = await db().sql`
    SELECT COUNT(*) AS n FROM invite_attempts
    WHERE ip = ${ip} AND created_at > now() - (${INVITE_ATTEMPT_WINDOW_MINUTES} || ' minutes')::interval
  `;
  return Number(rows[0]?.n ?? 0) < INVITE_ATTEMPT_LIMIT;
}

/** يسجّل محاولة فاشلة لمسار معيّن — يُستدعى فقط بعد فشل رمز الدعوة وبعد التأكد من عدم التجاوز */
export async function recordFailedInviteAttempt(ip: string, endpoint: string): Promise<void> {
  await db().sql`INSERT INTO invite_attempts (ip, endpoint) VALUES (${ip}, ${endpoint})`;
}

// ————— تدوير رمز دعوة المعلّم الزميل (STEP 6E — M2) —————

/**
 * يستبدل teacher_invite_code الحالي لهذي الحلقة برمز جديد فوراً — العمود
 * نفسه هو مصدر الحقيقة الوحيد (لا نسخة منفصلة بأي مكان)، فالتحديث المباشر
 * يُبطل القديم ويُفعّل الجديد بعملية واحدة ذرّية. نفس مستوى الإنتروبيا
 * المستخدم في halaqahTeacherInviteCode أعلاه (randomBytes(5) → ١٠ محارف hex).
 */
export async function rotateHalaqahTeacherInviteCode(halaqahId: number): Promise<string> {
  const generated = randomBytes(5).toString("hex");
  await db().sql`
    UPDATE halaqahs SET teacher_invite_code = ${generated} WHERE id = ${halaqahId}
  `;
  return generated;
}

/**
 * يستبدل رمز دعوة الطلاب برمز جديد — العمود نفسه مصدر الحقيقة الوحيد،
 * فالتحديث المباشر يُبطل الرابط القديم ويُفعّل الجديد بعملية واحدة ذرّية.
 * نفس مولّد halaqahInviteCode (randomBytes(5) → ١٠ محارف hex).
 */
export async function rotateHalaqahInviteCode(halaqahId: number): Promise<string> {
  const generated = randomBytes(5).toString("hex");
  await db().sql`
    UPDATE halaqahs SET invite_code = ${generated} WHERE id = ${halaqahId}
  `;
  return generated;
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

// ————— مدير الجامع والمشرف العام (STEP 5 — أساس، بلا مسارات دخول بعد) —————
// قراءة فقط بمعرّف الحساب — تكفي بناء الجلسة (lib/mosque-auth.ts،
// lib/super-admin-auth.ts). إنشاء الحسابات والدخول بكلمة مرور خطوة
// لاحقة منفصلة (تحتاج مسار API لا وجود له بعد).

export type MosqueAdmin = { id: number; mosqueId: number; username: string; sessionVersion: number };

export async function findMosqueAdminById(id: number): Promise<MosqueAdmin | null> {
  const rows = await db().sql`SELECT id, mosque_id, username, session_version FROM mosque_admins WHERE id = ${id}`;
  const row = rows[0];
  return row
    ? { id: row.id, mosqueId: row.mosque_id, username: row.username, sessionVersion: Number(row.session_version ?? 0) }
    : null;
}

/** نسخة جلسة مدير الجامع الحالية (٠ إن لم يوجد) — تُدرج في كوكيه عند الإصدار */
export async function mosqueAdminSessionVersion(adminId: number): Promise<number> {
  const rows = await db().sql`SELECT session_version FROM mosque_admins WHERE id = ${adminId}`;
  return Number(rows[0]?.session_version ?? 0);
}

export type SuperAdmin = { id: number; username: string };

export async function findSuperAdminById(id: number): Promise<SuperAdmin | null> {
  const rows = await db().sql`SELECT id, username FROM super_admins WHERE id = ${id}`;
  const row = rows[0];
  return row ? { id: row.id, username: row.username } : null;
}
