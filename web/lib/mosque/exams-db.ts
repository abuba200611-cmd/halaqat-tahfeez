import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { listMosqueMembers } from "./db";
import {
  DEFAULT_EXAM_TYPES,
  type CertificateKind,
  type DeductionRules,
  type ErrorCounts,
  type ExamConfig,
  type NominationStatus,
  parseExamConfig,
} from "./exams";

/*
  الاختبارات والشهادات — طبقة الوصول فوق قاعدة الحلقات الموحّدة (نفس موصّل
  @/lib/db). عزل الجامع بشرط mosque_id بكل استعلام كما ببقية النظام؛ طالب
  الاختبار طالب حقيقي (halaqah_id + student_id يشيران لمفتاح students
  المركّب). الإعدادات الرقمية لكل جامع في config ميزة "exams" بجدول
  mosque_features القائم (JSONB)، وقراءتها دائماً عبر parseExamConfig.
*/

// ————— الإعدادات (config ميزة exams) —————

export async function getExamConfig(mosqueId: number): Promise<ExamConfig> {
  const rows = await db().sql`
    SELECT config FROM mosque_features WHERE mosque_id = ${mosqueId} AND feature_key = 'exams'
  `;
  return parseExamConfig(rows[0]?.config);
}

/**
 * يكتب config الميزة — ON CONFLICT يحدّث config وحده فلا يغيّر تفعيل الميزة
 * ولا يقلب تعطيلاً إلى تفعيل. القيم تُصحَّح عند القراءة (parseExamConfig).
 */
export async function updateExamConfig(mosqueId: number, config: Record<string, unknown>): Promise<ExamConfig> {
  const merged = { ...((await rawExamConfig(mosqueId)) as object), ...config };
  await db().sql`
    INSERT INTO mosque_features (mosque_id, feature_key, enabled, config)
    VALUES (${mosqueId}, 'exams', false, ${JSON.stringify(merged)}::jsonb)
    ON CONFLICT (mosque_id, feature_key) DO UPDATE SET config = excluded.config, updated_at = now()
  `;
  return parseExamConfig(merged);
}

async function rawExamConfig(mosqueId: number): Promise<unknown> {
  const rows = await db().sql`
    SELECT config FROM mosque_features WHERE mosque_id = ${mosqueId} AND feature_key = 'exams'
  `;
  return rows[0]?.config ?? {};
}

/** قواعد الخصم الفعلية لنوع: قواعده فوق افتراضيات إعدادات الجامع */
export function effectiveDeductions(typeRules: Partial<DeductionRules> | null, config: ExamConfig): DeductionRules {
  return parseExamConfig({ deductions: { ...config.deductions, ...(typeRules ?? {}) } }).deductions;
}

// ————— أنواع الاختبارات —————

export type ExamType = {
  id: number;
  mosqueId: number;
  name: string;
  juzCount: number;
  maxScore: number;
  passMark: number;
  errorRules: Partial<DeductionRules>;
  active: boolean;
  sortOrder: number;
};

function rowToExamType(row: Record<string, unknown>): ExamType {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    name: row.name as string,
    juzCount: row.juz_count as number,
    maxScore: row.max_score as number,
    passMark: row.pass_mark as number,
    errorRules: (row.error_rules as Partial<DeductionRules> | null) ?? {},
    active: row.active === true,
    sortOrder: row.sort_order as number,
  };
}

const TYPE_COLUMNS = "id, mosque_id, name, juz_count, max_score, pass_mark, error_rules, active, sort_order";

export async function listExamTypes(mosqueId: number): Promise<ExamType[]> {
  const rows = await db().sql`
    SELECT ${TYPE_COLUMNS} FROM exam_types WHERE mosque_id = ${mosqueId} ORDER BY sort_order, id
  `;
  return rows.map(rowToExamType);
}

export async function listActiveExamTypes(mosqueId: number): Promise<ExamType[]> {
  const rows = await db().sql`
    SELECT ${TYPE_COLUMNS} FROM exam_types WHERE mosque_id = ${mosqueId} AND active ORDER BY sort_order, id
  `;
  return rows.map(rowToExamType);
}

/** أنواع الاختبار الأساسية — تُضاف الناقصة فقط (تعارض الاسم يتجاهل)، بدرجات إعدادات الجامع */
export async function seedDefaultExamTypes(mosqueId: number, config: ExamConfig): Promise<ExamType[]> {
  for (const [index, type] of DEFAULT_EXAM_TYPES.entries()) {
    await db().sql`
      INSERT INTO exam_types (mosque_id, name, juz_count, max_score, pass_mark, sort_order)
      VALUES (${mosqueId}, ${type.name}, ${type.juzCount}, ${config.maxScore}, ${config.passMark}, ${index + 1})
      ON CONFLICT (mosque_id, name) DO NOTHING
    `;
  }
  return listExamTypes(mosqueId);
}

export async function getExamType(mosqueId: number, id: number): Promise<ExamType | null> {
  const rows = await db().sql`
    SELECT ${TYPE_COLUMNS} FROM exam_types WHERE mosque_id = ${mosqueId} AND id = ${id}
  `;
  return rows[0] ? rowToExamType(rows[0]) : null;
}

/** إنشاء نوع — null إن وُجد آخر بنفس الاسم (409 عند المستدعي) */
export async function createExamType(
  mosqueId: number,
  input: { name: string; juzCount: number; maxScore: number; passMark: number; errorRules: Partial<DeductionRules> },
): Promise<ExamType | null> {
  const conflict = await db().sql`
    SELECT id FROM exam_types WHERE mosque_id = ${mosqueId} AND name = ${input.name}
  `;
  if (conflict[0]) return null;

  const rows = await db().sql`
    INSERT INTO exam_types (mosque_id, name, juz_count, max_score, pass_mark, error_rules, sort_order)
    VALUES (${mosqueId}, ${input.name}, ${input.juzCount}, ${input.maxScore}, ${input.passMark},
            ${JSON.stringify(input.errorRules)}::jsonb,
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM exam_types WHERE mosque_id = ${mosqueId}))
    RETURNING ${TYPE_COLUMNS}
  `;
  return rowToExamType(rows[0]);
}

/** تعديل نوع — null إن لم يوجد بهذا الجامع، و"conflict" إن تكرر الاسم */
export async function updateExamType(
  mosqueId: number,
  id: number,
  changes: {
    name?: string;
    juzCount?: number;
    maxScore?: number;
    passMark?: number;
    errorRules?: Partial<DeductionRules>;
    active?: boolean;
  },
): Promise<ExamType | "conflict" | null> {
  const existing = await getExamType(mosqueId, id);
  if (!existing) return null;

  const name = changes.name ?? existing.name;
  if (changes.name !== undefined && name !== existing.name) {
    const conflict = await db().sql`
      SELECT id FROM exam_types WHERE mosque_id = ${mosqueId} AND name = ${name} AND id <> ${id}
    `;
    if (conflict[0]) return "conflict";
  }

  const rows = await db().sql`
    UPDATE exam_types SET
      name = ${name},
      juz_count = ${changes.juzCount ?? existing.juzCount},
      max_score = ${changes.maxScore ?? existing.maxScore},
      pass_mark = ${changes.passMark ?? existing.passMark},
      error_rules = ${JSON.stringify(changes.errorRules ?? existing.errorRules)}::jsonb,
      active = ${changes.active ?? existing.active}
    WHERE mosque_id = ${mosqueId} AND id = ${id}
    RETURNING ${TYPE_COLUMNS}
  `;
  return rows[0] ? rowToExamType(rows[0]) : null;
}

/** حذف النوع يحذف ترشيحاته ونتائجه معه (تسلسل بالقاعدة) */
export async function deleteExamType(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`DELETE FROM exam_types WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

// ————— معلّمو الجامع (مرشّحو اللجان) —————

export async function listMosqueTeachers(mosqueId: number): Promise<{ id: number; name: string }[]> {
  const rows = await db().sql`
    SELECT t.id, COALESCE(NULLIF(t.teacher_name, ''), t.username) AS name
    FROM teachers t
    JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE h.mosque_id = ${mosqueId}
    ORDER BY name
  `;
  return rows.map((row) => ({ id: row.id as number, name: row.name as string }));
}

// ————— الترشيحات —————

export type NominationView = {
  id: number;
  mosqueId: number;
  typeId: number;
  typeName: string;
  halaqahId: number;
  halaqahName: string;
  studentId: string;
  studentName: string;
  juzFrom: number;
  juzTo: number;
  nominatedBy: number;
  nominatedByName: string;
  sessionId: number | null;
  status: NominationStatus;
  note: string;
  createdAt: string;
};

const NOMINATION_SELECT = `
  SELECT n.id, n.mosque_id, n.exam_type_id, n.halaqah_id, n.student_id, n.juz_from, n.juz_to,
         n.nominated_by, n.session_id, n.status, n.note, n.created_at,
         t.name AS type_name, h.name AS halaqah_name, s.name AS student_name,
         COALESCE(NULLIF(te.teacher_name, ''), te.username) AS nominated_by_name
  FROM exam_nominations n
  JOIN exam_types t ON t.id = n.exam_type_id
  JOIN halaqahs h ON h.id = n.halaqah_id
  LEFT JOIN students s ON s.teacher_id = n.halaqah_id AND s.id = n.student_id
  LEFT JOIN teachers te ON te.id = n.nominated_by
`;

function rowToNomination(row: Record<string, unknown>): NominationView {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    typeId: row.exam_type_id as number,
    typeName: row.type_name as string,
    halaqahId: row.halaqah_id as number,
    halaqahName: row.halaqah_name as string,
    studentId: row.student_id as string,
    studentName: (row.student_name as string | null) ?? "طالب محذوف",
    juzFrom: row.juz_from as number,
    juzTo: row.juz_to as number,
    nominatedBy: row.nominated_by as number,
    nominatedByName: (row.nominated_by_name as string | null) ?? "",
    sessionId: (row.session_id as number | null) ?? null,
    status: row.status as NominationStatus,
    note: row.note as string,
    createdAt: row.created_at as string,
  };
}

export async function listNominations(mosqueId: number): Promise<NominationView[]> {
  const rows = await db().sql`${NOMINATION_SELECT} WHERE n.mosque_id = ${mosqueId} ORDER BY n.created_at DESC, n.id DESC`;
  return rows.map(rowToNomination);
}

/** ترشيحات طلاب حلقة واحدة — لواجهة المعلّم (الجامع محدد بالحلقة) */
export async function listNominationsByHalaqah(halaqahId: number): Promise<NominationView[]> {
  const rows = await db().sql`${NOMINATION_SELECT} WHERE n.halaqah_id = ${halaqahId} ORDER BY n.created_at DESC, n.id DESC`;
  return rows.map(rowToNomination);
}

export async function getNomination(mosqueId: number, id: number): Promise<NominationView | null> {
  const rows = await db().sql`${NOMINATION_SELECT} WHERE n.mosque_id = ${mosqueId} AND n.id = ${id}`;
  return rows[0] ? rowToNomination(rows[0]) : null;
}

/** ترشيح بمعرّفه بلا شرط الجامع — لجلسات الممتحن؛ العزل يتمحور حول لجنة الجلسة */
export async function getNominationById(id: number): Promise<NominationView | null> {
  const rows = await db().sql`${NOMINATION_SELECT} WHERE n.id = ${id}`;
  return rows[0] ? rowToNomination(rows[0]) : null;
}

/** ترشيح جديد — "duplicate" إن وُجد ترشيح نشط لنفس (الطالب، النوع، النطاق)،
 * و"invalid" إن لم يكن النوع أو الطالب من هذا الجامع/الحلقة */
export async function createNomination(
  mosqueId: number,
  input: {
    typeId: number;
    halaqahId: number;
    studentId: string;
    juzFrom: number;
    juzTo: number;
    nominatedBy: number;
    note: string;
  },
): Promise<NominationView | "duplicate" | "invalid"> {
  const rows = await db().sql`
    INSERT INTO exam_nominations (mosque_id, exam_type_id, halaqah_id, student_id, juz_from, juz_to, nominated_by, note)
    SELECT ${mosqueId}::int, ${input.typeId}::int, ${input.halaqahId}::int, ${input.studentId}::text,
           ${input.juzFrom}::int, ${input.juzTo}::int, ${input.nominatedBy}::int, ${input.note}::text
    WHERE EXISTS (SELECT 1 FROM exam_types WHERE id = ${input.typeId} AND mosque_id = ${mosqueId})
      AND EXISTS (SELECT 1 FROM students WHERE teacher_id = ${input.halaqahId} AND id = ${input.studentId})
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  if (!rows[0]) {
    const active = await db().sql`
      SELECT id FROM exam_nominations
      WHERE halaqah_id = ${input.halaqahId} AND student_id = ${input.studentId}
        AND exam_type_id = ${input.typeId} AND juz_from = ${input.juzFrom} AND juz_to = ${input.juzTo}
        AND status IN ('pending', 'scheduled')
    `;
    return active[0] ? "duplicate" : "invalid";
  }
  return (await getNomination(mosqueId, Number(rows[0].id))) as NominationView;
}

/**
 * سحب ترشيح بلا نتيجة — نتيجة مسجَّلة لا تُسحب (السجل دراسي). false إن لم
 * يوجد أو لم يعد قابلاً للسحب.
 */
export async function withdrawNomination(mosqueId: number, id: number): Promise<boolean> {
  const rows = await db().sql`
    UPDATE exam_nominations SET status = 'withdrawn'
    WHERE mosque_id = ${mosqueId} AND id = ${id} AND status IN ('pending', 'scheduled')
    RETURNING id
  `;
  return rows.length > 0;
}

// ————— الجلسات ولجانها —————

export type SessionCommitteeMember = { kind: "teacher" | "member"; id: number; name: string };

export type SessionView = {
  id: number;
  mosqueId: number;
  typeId: number;
  typeName: string;
  juzCount: number;
  sessionDate: string;
  location: string;
  notes: string;
  status: "scheduled" | "closed";
  committee: SessionCommitteeMember[];
  scheduledCount: number;
  recordedCount: number;
  publishedCount: number;
};

export async function listSessions(mosqueId: number): Promise<SessionView[]> {
  const rows = await db().sql`
    SELECT es.id FROM exam_sessions es WHERE es.mosque_id = ${mosqueId}
    ORDER BY es.session_date DESC, es.id DESC
  `;
  const views = await Promise.all(rows.map((row) => getSession(mosqueId, Number(row.id))));
  return views.filter((session): session is SessionView => session !== null);
}

/** جلسة كاملة بلجنتها وعدّاداتها — بشرط الجامع */
export async function getSession(mosqueId: number, id: number): Promise<SessionView | null> {
  const rows = await db().sql`
    SELECT es.id, es.mosque_id, es.exam_type_id, es.session_date::text AS session_date,
           es.location, es.notes, es.status, t.name AS type_name, t.juz_count,
           (SELECT count(*)::int FROM exam_nominations n WHERE n.session_id = es.id AND n.status = 'scheduled') AS scheduled_count,
           (SELECT count(*)::int FROM exam_results r WHERE r.session_id = es.id) AS recorded_count,
           (SELECT count(*)::int FROM exam_results r WHERE r.session_id = es.id AND r.published_at IS NOT NULL) AS published_count
    FROM exam_sessions es
    JOIN exam_types t ON t.id = es.exam_type_id
    WHERE es.mosque_id = ${mosqueId} AND es.id = ${id}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    typeId: row.exam_type_id as number,
    typeName: row.type_name as string,
    juzCount: row.juz_count as number,
    sessionDate: row.session_date as string,
    location: row.location as string,
    notes: row.notes as string,
    status: row.status as "scheduled" | "closed",
    committee: await listSessionCommittee(id),
    scheduledCount: row.scheduled_count as number,
    recordedCount: row.recorded_count as number,
    publishedCount: row.published_count as number,
  };
}

/**
 * يصحّح لجنة جلسة من مدخلات المستخدم — معلّمو الجامع وأعضاؤه الأحرار فقط،
 * بلا تكرار وضمن سقف الإعدادات. رسالة خطأ عربية أو قائمة {kind, id}.
 */
export async function validateCommittee(
  mosqueId: number,
  input: unknown[],
): Promise<{ kind: "teacher" | "member"; id: number }[] | string> {
  if (!Array.isArray(input) || input.length === 0) return [];
  const config = await getExamConfig(mosqueId);
  if (input.length > config.committeeMaxMembers) return `اللجنة حتى ${config.committeeMaxMembers} أعضاء`;

  const [teachers, members] = await Promise.all([listMosqueTeachers(mosqueId), listMosqueMemberOptions(mosqueId)]);
  const teacherIds = new Set(teachers.map((t) => t.id));
  const memberIds = new Set(members.map((m) => m.id));

  const seen = new Set<string>();
  const result: { kind: "teacher" | "member"; id: number }[] = [];
  for (const entry of input) {
    const record = (entry ?? {}) as { kind?: unknown; id?: unknown };
    const id = record.id === undefined ? null : Number(record.id);
    if (!Number.isInteger(id) || (id as number) < 1) return "عضو لجنة غير صحيح";
    if (record.kind === "teacher" && teacherIds.has(id as number)) {
      if (seen.has(`teacher:${id}`)) continue;
      seen.add(`teacher:${id}`);
      result.push({ kind: "teacher", id: id as number });
    } else if (record.kind === "member" && memberIds.has(id as number)) {
      if (seen.has(`member:${id}`)) continue;
      seen.add(`member:${id}`);
      result.push({ kind: "member", id: id as number });
    } else {
      return "عضو اللجنة ليس من هذا الجامع";
    }
  }
  return result;
}

/** كشف جلسة — كل ترشيح من جامعنا وبنوع الجلسة نفسه، أو رسالة خطأ */
export async function validateRoster(mosqueId: number, typeId: number, input: unknown[]): Promise<number[] | string> {
  if (!Array.isArray(input)) return [];
  const ids: number[] = [];
  for (const entry of input) {
    const id = Number(entry);
    if (!Number.isInteger(id) || id < 1) return "ترشيح غير صحيح";
    const nomination = await getNomination(mosqueId, id);
    if (!nomination) return "ترشيح ليس من هذا الجامع";
    if (nomination.typeId !== typeId) return "ترشيح من نوع مختلف عن نوع الجلسة";
    ids.push(id);
  }
  return ids;
}

/** جلسة بمعرّفها بلا شرط الجامع — لشاشة الممتحن (صلاحيته من لجنتها) */
export async function getSessionById(id: number): Promise<SessionView | null> {
  const rows = await db().sql`SELECT mosque_id FROM exam_sessions WHERE id = ${id}`;
  return rows[0] ? getSession(Number(rows[0].mosque_id), id) : null;
}

export async function listSessionCommittee(sessionId: number): Promise<SessionCommitteeMember[]> {
  const rows = await db().sql`
    SELECT m.member_kind, m.member_id,
           CASE m.member_kind
             WHEN 'teacher' THEN (SELECT COALESCE(NULLIF(t.teacher_name, ''), t.username) FROM teachers t WHERE t.id = m.member_id)
             ELSE (SELECT mm.name FROM mosque_members mm WHERE mm.id = m.member_id)
           END AS name
    FROM exam_session_members m
    WHERE m.session_id = ${sessionId}
    ORDER BY name
  `;
  return rows
    .filter((row) => row.name !== null && row.name !== undefined)
    .map((row) => ({
      kind: row.member_kind as "teacher" | "member",
      id: row.member_id as number,
      name: row.name as string,
    }));
}

export async function createSession(
  mosqueId: number,
  input: { typeId: number; sessionDate: string; location: string; notes: string },
): Promise<number | null> {
  const rows = await db().sql`
    INSERT INTO exam_sessions (mosque_id, exam_type_id, session_date, location, notes)
    SELECT ${mosqueId}::int, ${input.typeId}::int, ${input.sessionDate}::date, ${input.location}::text, ${input.notes}::text
    WHERE EXISTS (SELECT 1 FROM exam_types WHERE id = ${input.typeId} AND mosque_id = ${mosqueId})
    RETURNING id
  `;
  return rows[0] ? Number(rows[0].id) : null;
}

export async function updateSession(
  mosqueId: number,
  id: number,
  changes: { sessionDate?: string; location?: string; notes?: string; status?: "scheduled" | "closed" },
): Promise<SessionView | null> {
  const existing = await getSession(mosqueId, id);
  if (!existing) return null;

  await db().sql`
    UPDATE exam_sessions SET
      session_date = COALESCE(${changes.sessionDate ?? null}::date, session_date),
      location = COALESCE(${changes.location ?? null}, location),
      notes = COALESCE(${changes.notes ?? null}, notes),
      status = COALESCE(${changes.status ?? null}, status)
    WHERE mosque_id = ${mosqueId} AND id = ${id}
  `;
  return getSession(mosqueId, id);
}

/** استبدال لجنة الجلسة كاملة (الأعضاء صُحّحوا للجامع قبلها بالمسار) */
export async function setSessionCommittee(
  mosqueId: number,
  sessionId: number,
  members: { kind: "teacher" | "member"; id: number }[],
): Promise<boolean> {
  const session = await getSession(mosqueId, sessionId);
  if (!session) return false;
  await db().sql`DELETE FROM exam_session_members WHERE session_id = ${sessionId}`;
  for (const member of members) {
    await db().sql`
      INSERT INTO exam_session_members (session_id, member_kind, member_id)
      VALUES (${sessionId}, ${member.kind}, ${member.id})
      ON CONFLICT (session_id, member_kind, member_id) DO NOTHING
    `;
  }
  return true;
}

/**
 * جدولة ترشيحات الجلسة: القائمة المعطاة هي كشف الجلسة كاملاً — من دخلها
 * من «بانتظار» صار «مجدولاً»، ومن خرج منها بلا نتيجة عاد «بانتظار». من
 * له نتيجة لا يُحرَّك (السجل محفوظ).
 */
export async function setSessionRoster(mosqueId: number, sessionId: number, nominationIds: number[]): Promise<void> {
  const current = await db().sql`
    SELECT id FROM exam_nominations WHERE mosque_id = ${mosqueId} AND session_id = ${sessionId}
  `;
  const currentIds = new Set(current.map((row) => Number(row.id)));
  const wanted = new Set(nominationIds);

  for (const id of currentIds) {
    if (wanted.has(id)) continue;
    await db().sql`
      UPDATE exam_nominations SET session_id = NULL, status = 'pending'
      WHERE mosque_id = ${mosqueId} AND id = ${id} AND status = 'scheduled'
    `;
  }
  for (const id of wanted) {
    if (currentIds.has(id)) continue;
    await db().sql`
      UPDATE exam_nominations SET session_id = ${sessionId}, status = 'scheduled'
      WHERE mosque_id = ${mosqueId} AND id = ${id} AND status = 'pending'
    `;
  }
}

/** حذف جلسة — يرفض (null="has-results") ما له نتائج مسجَّلة كي لا تُمحى درجات */
export async function deleteSession(mosqueId: number, id: number): Promise<boolean | "has-results"> {
  const results = await db().sql`SELECT id FROM exam_results WHERE session_id = ${id} LIMIT 1`;
  if (results[0]) return "has-results";
  await db().sql`
    UPDATE exam_nominations SET session_id = NULL, status = 'pending'
    WHERE mosque_id = ${mosqueId} AND session_id = ${id} AND status = 'scheduled'
  `;
  const rows = await db().sql`DELETE FROM exam_sessions WHERE mosque_id = ${mosqueId} AND id = ${id} RETURNING id`;
  return rows.length > 0;
}

// ————— النتائج —————

export type ResultView = {
  id: number;
  mosqueId: number;
  nominationId: number;
  sessionId: number;
  sessionDate: string;
  typeId: number;
  typeName: string;
  halaqahId: number;
  halaqahName: string;
  studentId: string;
  studentName: string;
  juzFrom: number;
  juzTo: number;
  maxScore: number;
  passMark: number;
  errors: ErrorCounts;
  score: number;
  passed: boolean;
  examinerId: number;
  examinerName: string;
  /** المعلّم المرشِّح (nominations.nominated_by) — يُشعَر عند النشر */
  nominatedBy: number;
  notes: string;
  publishedAt: string | null;
  createdAt: string;
};

const RESULT_SELECT = `
  SELECT r.id, r.mosque_id, r.nomination_id, r.session_id, r.halaqah_id, r.student_id,
         r.juz_from, r.juz_to, r.max_score, r.pass_mark, r.errors, r.score, r.passed,
         r.examiner_id, r.notes, r.published_at, r.created_at, n.nominated_by,
         es.session_date::text AS session_date, t.id AS type_id, t.name AS type_name,
         h.name AS halaqah_name, s.name AS student_name,
         COALESCE(NULLIF(te.teacher_name, ''), te.username) AS examiner_name
  FROM exam_results r
  JOIN exam_sessions es ON es.id = r.session_id
  JOIN exam_nominations n ON n.id = r.nomination_id
  JOIN exam_types t ON t.id = n.exam_type_id
  JOIN halaqahs h ON h.id = r.halaqah_id
  LEFT JOIN students s ON s.teacher_id = r.halaqah_id AND s.id = r.student_id
  LEFT JOIN teachers te ON te.id = r.examiner_id
`;

function rowToResult(row: Record<string, unknown>): ResultView {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    nominationId: row.nomination_id as number,
    sessionId: row.session_id as number,
    sessionDate: row.session_date as string,
    typeId: row.type_id as number,
    typeName: row.type_name as string,
    halaqahId: row.halaqah_id as number,
    halaqahName: row.halaqah_name as string,
    studentId: row.student_id as string,
    studentName: (row.student_name as string | null) ?? "طالب محذوف",
    juzFrom: row.juz_from as number,
    juzTo: row.juz_to as number,
    maxScore: row.max_score as number,
    passMark: row.pass_mark as number,
    errors: (row.errors as ErrorCounts | null) ?? { jali: 0, khafi: 0, taraddud: 0, nisyan: 0 },
    score: row.score as number,
    passed: row.passed === true,
    examinerId: row.examiner_id as number,
    examinerName: (row.examiner_name as string | null) ?? "",
    nominatedBy: row.nominated_by as number,
    notes: row.notes as string,
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function listResults(mosqueId: number, limit = 100): Promise<ResultView[]> {
  const rows = await db().sql`
    ${RESULT_SELECT} WHERE r.mosque_id = ${mosqueId}
    ORDER BY r.created_at DESC, r.id DESC LIMIT ${limit}
  `;
  return rows.map(rowToResult);
}

/** النتائج المنشورة لطالب واحد — ما يراه الطالب وولي الأمر */
export async function listPublishedResultsForStudent(halaqahId: number, studentId: string): Promise<ResultView[]> {
  const rows = await db().sql`
    ${RESULT_SELECT} WHERE r.halaqah_id = ${halaqahId} AND r.student_id = ${studentId} AND r.published_at IS NOT NULL
    ORDER BY es.session_date DESC, r.id DESC
  `;
  return rows.map(rowToResult);
}

/** نتيجة واحدة بشرط الجامع */
export async function getResult(mosqueId: number, id: number): Promise<ResultView | null> {
  const rows = await db().sql`${RESULT_SELECT} WHERE r.mosque_id = ${mosqueId} AND r.id = ${id}`;
  return rows[0] ? rowToResult(rows[0]) : null;
}

/**
 * تسجيل/تحديث نتيجة ترشيح داخل جلسة — الدرجات محسوبة بالمسار من قواعد
 * النوع (لقطة بالصف). upsert على nomination_id: التحديث مسموح ما دامت
 * غير منشورة. publish=true ينشرها أول مرة فقط (firstPublish يحدد الإشعار).
 */
export async function recordResult(
  mosqueId: number,
  input: {
    nominationId: number;
    sessionId: number;
    halaqahId: number;
    studentId: string;
    juzFrom: number;
    juzTo: number;
    maxScore: number;
    passMark: number;
    errors: ErrorCounts;
    score: number;
    passed: boolean;
    examinerId: number;
    notes: string;
  },
  publish: boolean,
): Promise<{ result: ResultView; firstPublish: boolean } | "published" | null> {
  const existing = await db().sql`
    SELECT id, published_at FROM exam_results WHERE nomination_id = ${input.nominationId}
  `;
  const wasPublished = Boolean(existing[0] && existing[0].published_at !== null);
  if (wasPublished) return "published";

  const rows = await db().sql`
    INSERT INTO exam_results (mosque_id, nomination_id, session_id, halaqah_id, student_id,
      juz_from, juz_to, max_score, pass_mark, errors, score, passed, examiner_id, notes, published_at)
    VALUES (${mosqueId}::int, ${input.nominationId}::int, ${input.sessionId}::int, ${input.halaqahId}::int,
            ${input.studentId}::text, ${input.juzFrom}::int, ${input.juzTo}::int, ${input.maxScore}::int,
            ${input.passMark}::int, ${JSON.stringify(input.errors)}::jsonb, ${input.score}::int, ${input.passed}::boolean,
            ${input.examinerId}::int, ${input.notes}::text, CASE WHEN ${publish}::boolean THEN now() ELSE NULL END)
    ON CONFLICT (nomination_id) DO UPDATE SET
      session_id = excluded.session_id, errors = excluded.errors, score = excluded.score,
      passed = excluded.passed, examiner_id = excluded.examiner_id, notes = excluded.notes,
      published_at = COALESCE(exam_results.published_at, excluded.published_at), updated_at = now()
    RETURNING id
  `;
  if (!rows[0]) return null;
  await db().sql`
    UPDATE exam_nominations SET status = 'done'
    WHERE id = ${input.nominationId} AND session_id = ${input.sessionId}
  `;

  const result = await getResult(mosqueId, Number(rows[0].id));
  if (!result) return null;
  return { result, firstPublish: publish && !wasPublished };
}

/** نشر/سحب نشر نتيجة (الإدارة) — firstPublish عند أول نشر فقط (يحدد الإشعار) */
export async function setResultPublished(
  mosqueId: number,
  resultId: number,
  published: boolean,
): Promise<{ result: ResultView; firstPublish: boolean } | null> {
  const before = await db().sql`
    SELECT published_at FROM exam_results WHERE mosque_id = ${mosqueId} AND id = ${resultId}
  `;
  if (!before[0]) return null;
  const wasPublished = before[0].published_at !== null;

  await db().sql`
    UPDATE exam_results SET
      published_at = CASE WHEN ${published} THEN COALESCE(published_at, now()) ELSE NULL END,
      updated_at = now()
    WHERE mosque_id = ${mosqueId} AND id = ${resultId}
  `;
  const result = await getResult(mosqueId, resultId);
  if (!result) return null;
  return { result, firstPublish: published && !wasPublished };
}

// ————— شاشة الممتحن (جلسات المعلم المنتدب) —————

export async function listScoringSessionsForTeacher(teacherId: number): Promise<SessionView[]> {
  const rows = await db().sql`
    SELECT es.id, es.mosque_id FROM exam_sessions es
    WHERE EXISTS (
      SELECT 1 FROM exam_session_members m
      WHERE m.session_id = es.id AND m.member_kind = 'teacher' AND m.member_id = ${teacherId}
    )
    ORDER BY es.session_date DESC, es.id DESC
  `;
  const views = await Promise.all(rows.map((row) => getSession(Number(row.mosque_id), Number(row.id))));
  return views.filter((session): session is SessionView => session !== null);
}

/** هل المعلّم بلجنة الجلسة؟ — شرط شاشة التقييم */
export async function isSessionExaminer(sessionId: number, teacherId: number): Promise<boolean> {
  const rows = await db().sql`
    SELECT id FROM exam_session_members
    WHERE session_id = ${sessionId} AND member_kind = 'teacher' AND member_id = ${teacherId}
  `;
  return rows.length > 0;
}

/** كشف جلسة للممتحن: ترشيحاتها المجدولة بحالة كل طالب ونتيجته */
export type ScoringRow = { nomination: NominationView; result: ResultView | null };

export async function listSessionScoringRows(mosqueId: number, sessionId: number): Promise<ScoringRow[]> {
  const nominations = await db().sql`
    SELECT n.id FROM exam_nominations n
    WHERE n.mosque_id = ${mosqueId} AND n.session_id = ${sessionId} AND n.status IN ('scheduled', 'done')
    ORDER BY n.created_at, n.id
  `;
  const results = await db().sql`
    SELECT r.nomination_id, r.id FROM exam_results r WHERE r.session_id = ${sessionId}
  `;
  const resultByNomination = new Map(results.map((row) => [Number(row.nomination_id), Number(row.id)]));
  const rows: ScoringRow[] = [];
  for (const row of nominations) {
    const nomination = await getNomination(mosqueId, Number(row.id));
    if (!nomination) continue;
    const resultId = resultByNomination.get(nomination.id);
    rows.push({ nomination, result: resultId ? await getResult(mosqueId, resultId) : null });
  }
  return rows;
}

/** طالب حلقة (للترشيح) — null إن لم يكن من طلابها الفعّالين */
export async function findStudentInHalaqah(
  halaqahId: number,
  studentId: string,
): Promise<{ id: string; name: string } | null> {
  const rows = await db().sql`
    SELECT id, name FROM students
    WHERE teacher_id = ${halaqahId} AND id = ${studentId} AND deleted_at IS NULL AND active
  `;
  return rows[0] ? { id: rows[0].id as string, name: rows[0].name as string } : null;
}

// ————— إحصاءات التقارير —————

export type ExamStatsTotals = { sessions: number; results: number; passed: number; passRate: number | null };
export type ExamStatsByHalaqah = { halaqahId: number; name: string; teacherName: string; results: number; passed: number };
export type ExamStatsByTeacher = { teacherId: number; name: string; nominated: number; results: number; passed: number };
export type ExamStatsByType = { typeId: number; name: string; results: number; passed: number };

export type ExamStats = {
  totals: ExamStatsTotals;
  byHalaqah: ExamStatsByHalaqah[];
  byTeacher: ExamStatsByTeacher[];
  byType: ExamStatsByType[];
};

/** إحصاءات فترة: الجلسات بتاريخها، والنتائج بتاريخ جلستها، والإنتاجية لمرشِّح الترشيح */
export async function examStatsBetween(mosqueId: number, from: string, to: string): Promise<ExamStats> {
  const [sessions, byHalaqah, byTeacher, byType] = await Promise.all([
    db().sql`
      SELECT count(*)::int AS n FROM exam_sessions
      WHERE mosque_id = ${mosqueId} AND session_date >= ${from}::date AND session_date <= ${to}::date
    `,
    db().sql`
      SELECT r.halaqah_id, h.name,
             COALESCE((
               SELECT string_agg(t.teacher_name, '، ' ORDER BY (t.role = 'supervisor') DESC)
               FROM teachers t WHERE t.halaqah_id = r.halaqah_id AND t.teacher_name != ''
             ), '') AS teacher_name,
             count(*)::int AS results, count(*) FILTER (WHERE r.passed)::int AS passed
      FROM exam_results r
      JOIN exam_sessions es ON es.id = r.session_id
      JOIN halaqahs h ON h.id = r.halaqah_id
      WHERE r.mosque_id = ${mosqueId} AND es.session_date >= ${from}::date AND es.session_date <= ${to}::date
      GROUP BY r.halaqah_id, h.name
      ORDER BY passed DESC, results DESC, h.name
    `,
    db().sql`
      SELECT te.id AS teacher_id, COALESCE(NULLIF(te.teacher_name, ''), te.username) AS name,
             count(n.id)::int AS nominated,
             count(r.id)::int AS results,
             count(r.id) FILTER (WHERE r.passed)::int AS passed
      FROM exam_nominations n
      JOIN teachers te ON te.id = n.nominated_by
      LEFT JOIN exam_results r ON r.nomination_id = n.id
      WHERE n.mosque_id = ${mosqueId} AND n.status <> 'withdrawn'
        AND n.created_at >= ${from}::date AND n.created_at < (${to}::date + INTERVAL '1 day')
      GROUP BY te.id, name
      ORDER BY passed DESC, nominated DESC, name
    `,
    db().sql`
      SELECT t.id AS type_id, t.name, count(r.id)::int AS results, count(r.id) FILTER (WHERE r.passed)::int AS passed
      FROM exam_results r
      JOIN exam_nominations n ON n.id = r.nomination_id
      JOIN exam_types t ON t.id = n.exam_type_id
      JOIN exam_sessions es ON es.id = r.session_id
      WHERE r.mosque_id = ${mosqueId} AND es.session_date >= ${from}::date AND es.session_date <= ${to}::date
      GROUP BY t.id, t.name
      ORDER BY results DESC, t.name
    `,
  ]);

  const results = byType.reduce((sum, row) => sum + Number(row.results), 0);
  const passed = byType.reduce((sum, row) => sum + Number(row.passed), 0);
  return {
    totals: {
      sessions: Number(sessions[0].n),
      results,
      passed,
      passRate: results > 0 ? Math.round((passed / results) * 100) : null,
    },
    byHalaqah: byHalaqah.map((row) => ({
      halaqahId: row.halaqah_id as number,
      name: row.name as string,
      teacherName: (row.teacher_name as string | null) ?? "",
      results: row.results as number,
      passed: row.passed as number,
    })),
    byTeacher: byTeacher.map((row) => ({
      teacherId: row.teacher_id as number,
      name: row.name as string,
      nominated: row.nominated as number,
      results: row.results as number,
      passed: row.passed as number,
    })),
    byType: byType.map((row) => ({
      typeId: row.type_id as number,
      name: row.name as string,
      results: row.results as number,
      passed: row.passed as number,
    })),
  };
}

// ————— الشهادات —————

export type CertificateView = {
  id: number;
  mosqueId: number;
  code: string;
  kind: CertificateKind;
  holderName: string;
  title: string;
  resultId: number | null;
  teacherId: number | null;
  halaqahId: number | null;
  studentId: string | null;
  payload: Record<string, string>;
  issuedAt: string;
  revokedAt: string | null;
  createdAt: string;
};

function rowToCertificate(row: Record<string, unknown>): CertificateView {
  return {
    id: row.id as number,
    mosqueId: row.mosque_id as number,
    code: row.code as string,
    kind: row.kind as CertificateKind,
    holderName: row.holder_name as string,
    title: row.title as string,
    resultId: (row.result_id as number | null) ?? null,
    teacherId: (row.teacher_id as number | null) ?? null,
    halaqahId: (row.halaqah_id as number | null) ?? null,
    studentId: (row.student_id as string | null) ?? null,
    payload: (row.payload as Record<string, string> | null) ?? {},
    issuedAt: row.issued_at as string,
    revokedAt: (row.revoked_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

const CERT_COLUMNS = "id, mosque_id, code, kind, holder_name, title, result_id, teacher_id, halaqah_id, student_id, payload, issued_at::text AS issued_at, revoked_at, created_at";

export async function listCertificates(mosqueId: number): Promise<CertificateView[]> {
  const rows = await db().sql`
    SELECT ${CERT_COLUMNS} FROM certificates WHERE mosque_id = ${mosqueId} ORDER BY created_at DESC, id DESC
  `;
  return rows.map(rowToCertificate);
}

export async function getCertificate(mosqueId: number, id: number): Promise<CertificateView | null> {
  const rows = await db().sql`
    SELECT ${CERT_COLUMNS} FROM certificates WHERE mosque_id = ${mosqueId} AND id = ${id}
  `;
  return rows[0] ? rowToCertificate(rows[0]) : null;
}

function newCertificateCode(prefix: string): string {
  return `${prefix}-${randomBytes(12).toString("base64url")}`;
}

/** إصدار شهادة برمز تحقق فريد — بيانات الحامل لقطة (تبقى بعد حذف الأصل) */
export async function issueCertificate(
  mosqueId: number,
  config: ExamConfig,
  input: {
    kind: CertificateKind;
    holderName: string;
    title: string;
    resultId: number | null;
    teacherId: number | null;
    halaqahId: number | null;
    studentId: string | null;
    payload: Record<string, string>;
  },
): Promise<CertificateView> {
  for (let attempt = 0; ; attempt++) {
    const code = newCertificateCode(config.certificatePrefix);
    try {
      const rows = await db().sql`
        INSERT INTO certificates (mosque_id, code, kind, holder_name, title, result_id, teacher_id, halaqah_id, student_id, payload)
        VALUES (${mosqueId}, ${code}, ${input.kind}, ${input.holderName}, ${input.title}, ${input.resultId},
                ${input.teacherId}, ${input.halaqahId}, ${input.studentId}, ${JSON.stringify(input.payload)}::jsonb)
        RETURNING ${CERT_COLUMNS}
      `;
      return rowToCertificate(rows[0]);
    } catch (error) {
      // تصادم الرمز الفريد شبه مستحيل — محاولة ثانية واحدة ثم رمي
      if (attempt >= 1) throw error;
    }
  }
}

/** سحب/إعادة شهادة — false إن لم توجد بهذا الجامع */
export async function setCertificateRevoked(mosqueId: number, id: number, revoked: boolean): Promise<CertificateView | null> {
  const rows = await db().sql`
    UPDATE certificates SET revoked_at = CASE WHEN ${revoked}::boolean THEN now() ELSE NULL END
    WHERE mosque_id = ${mosqueId} AND id = ${id}
    RETURNING ${CERT_COLUMNS}
  `;
  return rows[0] ? rowToCertificate(rows[0]) : null;
}

export type CertificateVerifyView = {
  valid: boolean;
  mosqueId: number;
  mosqueName: string;
  kind: CertificateKind;
  holderName: string;
  title: string;
  issuedAt: string;
};

/**
 * بيانات التحقق العامة بالرمز — الاسم والإنجاز والتاريخ والجامع فقط، لا
 * درجات ولا هواتف ولا معرّفات داخلية (صفحة /verify عامة للجميع).
 * mosqueId داخلي لحدّ معدل الجامع، لا يُسلسل بالرد.
 */
export async function findCertificateForVerification(code: string): Promise<CertificateVerifyView | null> {
  const rows = await db().sql`
    SELECT c.kind, c.holder_name, c.title, c.issued_at::text AS issued_at, c.revoked_at,
           c.mosque_id, m.name AS mosque_name
    FROM certificates c
    JOIN mosques m ON m.id = c.mosque_id
    WHERE c.code = ${code}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    valid: row.revoked_at === null,
    mosqueId: row.mosque_id as number,
    mosqueName: row.mosque_name as string,
    kind: row.kind as CertificateKind,
    holderName: row.holder_name as string,
    title: row.title as string,
    issuedAt: row.issued_at as string,
  };
}

// ————— أدوات مساعدة للمسارات —————

/** أعضاء الجامع الأحرار — مرشّحو اللجان بجانب المعلّمين (نفس بيانات منتقي الأفراد) */
export async function listMosqueMemberOptions(mosqueId: number): Promise<{ id: number; name: string }[]> {
  const members = await listMosqueMembers(mosqueId);
  return members.map((member) => ({ id: member.id, name: member.name }));
}
