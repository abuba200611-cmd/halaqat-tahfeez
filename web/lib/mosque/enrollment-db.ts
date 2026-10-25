import "server-only";

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { ensureStudentIdentity } from "@/lib/identity";
import {
  isLevel,
  moveInWaitlist,
  pickHalaqah,
  selectPromotions,
  type CriteriaInput,
  type HalaqahSlot,
  type Level,
  type Registrant,
} from "@/lib/enrollment";
import {
  validateRows,
  type ImportContext,
  type ImportSummary,
  type RawRow,
  type RowResult,
} from "@/lib/student-import";
import { isFeatureEnabled } from "./db";
import { emitMosqueEvent } from "@/lib/webhooks-db";
import { studentCreatedPayload } from "@/lib/webhooks";

/*
  طبقة بيانات التوزيع الآلي وقائمة الانتظار والاستيراد. كل كتابة تجري داخل
  ترانزاكشن تقفل صف الجامع (SELECT … FOR UPDATE) فتتسلسل العمليات على جامع واحد:
  لا يتجاوز توزيعان متزامنان السعة، ولا تُرقّى دفعتان لنفس المقعد.
  كل استعلام مقيّد بـ mosque_id الذي حُقّق من المسار — لا IDOR.
*/

export const AUTO_ASSIGN_KEY = "auto_assign";
export const IMPORT_KEY = "student_import";

type Tx = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
};

/** طلاب أُنشئوا داخل ترانزاكشن لم تُلتزَم بعد — تُصدَر أحداثهم بعد COMMIT فقط */
const createdInTx = new WeakMap<object, { halaqahId: number; id: string; name: string }[]>();

export async function withMosqueTx<T>(mosqueId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db().pool.connect();
  let result: T;
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM mosques WHERE id = $1 FOR UPDATE", [mosqueId]);
    result = await fn(client as unknown as Tx);
    await client.query("COMMIT");
  } catch (error) {
    createdInTx.delete(client);
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  const created = createdInTx.get(client) ?? [];
  createdInTx.delete(client);
  for (const s of created) {
    await emitMosqueEvent(mosqueId, "student.created", studentCreatedPayload(s.halaqahId, s.id, s.name));
  }
  return result;
}

// ————— قراءات مشتركة —————

function rowToSlot(row: Record<string, unknown>): HalaqahSlot {
  return {
    id: Number(row.id),
    name: String(row.name),
    capacity: row.capacity === null || row.capacity === undefined ? null : Number(row.capacity),
    count: Number(row.cnt ?? 0),
    minAge: row.min_age === null || row.min_age === undefined ? null : Number(row.min_age),
    maxAge: row.max_age === null || row.max_age === undefined ? null : Number(row.max_age),
    level: isLevel(row.level) ? row.level : null,
  };
}

const SLOT_SELECT = `
  SELECT h.id, h.name, h.capacity, h.min_age, h.max_age, h.level,
         (SELECT count(*)::int FROM students s
           WHERE s.teacher_id = h.id AND s.deleted_at IS NULL AND s.active) AS cnt
  FROM halaqahs h
`;

/** حلقات الجامع بعدد طلابها الفعّالين الحالي (الموقوف والمحذوف لا يشغلان مقعداً) */
export async function loadSlots(tx: Tx, mosqueId: number): Promise<HalaqahSlot[]> {
  const result = await tx.query(`${SLOT_SELECT} WHERE h.mosque_id = $1 ORDER BY h.id`, [mosqueId]);
  return result.rows.map(rowToSlot);
}

function registrantOf(row: Record<string, unknown>): Registrant {
  return {
    birthYear: row.birth_year === null || row.birth_year === undefined ? null : Number(row.birth_year),
    level: isLevel(row.level) ? row.level : null,
  };
}

async function logActivity(
  tx: Tx,
  mosqueId: number,
  kind: string,
  registrationId: number | null,
  halaqahId: number | null,
  message: string,
): Promise<void> {
  await tx.query(
    "INSERT INTO enrollment_activity (mosque_id, kind, registration_id, halaqah_id, message) VALUES ($1, $2, $3, $4, $5)",
    [mosqueId, kind, registrationId, halaqahId, message],
  );
}

/** ينشئ طالباً فعلياً بحلقته بنفس ترانزاكشن الجامع (مثل addStudentToHalaqah + الهوية الموحّدة) */
export async function insertStudentTx(tx: Tx, halaqahId: number, name: string): Promise<string> {
  const id = randomBytes(12).toString("hex");
  await tx.query(
    `INSERT INTO students (id, teacher_id, name, group_name, ranges, mastery, active, rating, sort_order, created_at)
     VALUES ($1, $2, $3, '', '[]', '{}', true, 0, 0, now())`,
    [id, halaqahId, name],
  );
  await ensureStudentIdentity(tx, { halaqahId, id, name, username: null, active: true });
  const pending = createdInTx.get(tx) ?? [];
  pending.push({ halaqahId, id, name });
  createdInTx.set(tx, pending);
  return id;
}

// ————— التوزيع الآلي —————

export type AutoAssignOutcome =
  | { kind: "assigned"; halaqahId: number; halaqahName: string; studentId: string }
  | { kind: "waitlisted"; position: number };

/** يوزّع تسجيلاً معلّقاً داخل ترانزاكشن قائمة (القفل ممسوك). null = غير معلّق أو لا حلقات */
export async function autoAssignTx(
  tx: Tx,
  mosqueId: number,
  registrationId: number,
  currentYear: number,
): Promise<AutoAssignOutcome | null> {
  const regs = await tx.query(
    `SELECT id, name, birth_year, level FROM mosque_registrations
     WHERE id = $1 AND mosque_id = $2 AND status = 'pending' FOR UPDATE`,
    [registrationId, mosqueId],
  );
  const reg = regs.rows[0];
  if (!reg) return null;

  const slots = await loadSlots(tx, mosqueId);
  if (slots.length === 0) return null; // لا حلقات بعد: يبقى بانتظار التوزيع اليدوي

  const name = String(reg.name);
  const pick = pickHalaqah(slots, registrantOf(reg), currentYear);
  if (pick) {
    const studentId = await insertStudentTx(tx, pick.id, name);
    await tx.query(
      `UPDATE mosque_registrations
       SET status = 'assigned', halaqah_id = $1, student_id = $2, assigned_at = now(),
           waitlist_order = NULL, waitlisted_at = NULL
       WHERE id = $3 AND mosque_id = $4`,
      [pick.id, studentId, registrationId, mosqueId],
    );
    await logActivity(tx, mosqueId, "auto_assigned", registrationId, pick.id, `وُزّع «${name}» آلياً على حلقة «${pick.name}»`);
    return { kind: "assigned", halaqahId: pick.id, halaqahName: pick.name, studentId };
  }

  const next = await tx.query(
    "SELECT COALESCE(MAX(waitlist_order), 0) + 1 AS next FROM mosque_registrations WHERE mosque_id = $1 AND status = 'waitlisted'",
    [mosqueId],
  );
  const order = Number(next.rows[0]?.next ?? 1);
  await tx.query(
    "UPDATE mosque_registrations SET status = 'waitlisted', waitlist_order = $1, waitlisted_at = now() WHERE id = $2 AND mosque_id = $3",
    [order, registrationId, mosqueId],
  );
  const position = await waitlistPosition(tx, mosqueId, registrationId);
  await logActivity(tx, mosqueId, "waitlisted", registrationId, null, `«${name}» بقائمة الانتظار (الدور ${position}) — لا مقعد مناسب حالياً`);
  return { kind: "waitlisted", position };
}

async function waitlistPosition(tx: Tx, mosqueId: number, registrationId: number): Promise<number> {
  const result = await tx.query(
    "SELECT id FROM mosque_registrations WHERE mosque_id = $1 AND status = 'waitlisted' ORDER BY waitlist_order, id",
    [mosqueId],
  );
  return result.rows.findIndex((row) => Number(row.id) === registrationId) + 1;
}

/** تسجيل جديد من الرابط العام: يوزَّع آلياً إن كانت الميزة مفعّلة والحلقات مفعّلة. فشله لا يُسقط التسجيل */
export async function autoAssignRegistration(mosqueId: number, registrationId: number): Promise<AutoAssignOutcome | null> {
  if (!(await isFeatureEnabled(mosqueId, AUTO_ASSIGN_KEY)) || !(await isFeatureEnabled(mosqueId, "halaqat"))) return null;
  return withMosqueTx(mosqueId, (tx) => autoAssignTx(tx, mosqueId, registrationId, new Date().getFullYear()));
}

/** يوزّع المعلّقين القدامى دفعة واحدة (عند تفعيل الميزة على جامع لديه طابور) — بحدّ أعلى للأمان */
export async function autoAssignPending(mosqueId: number, limit = 200): Promise<{ assigned: number; waitlisted: number }> {
  return withMosqueTx(mosqueId, async (tx) => {
    const pending = await tx.query(
      "SELECT id FROM mosque_registrations WHERE mosque_id = $1 AND status = 'pending' ORDER BY created_at, id LIMIT $2",
      [mosqueId, limit],
    );
    const year = new Date().getFullYear();
    let assigned = 0;
    let waitlisted = 0;
    for (const row of pending.rows) {
      const outcome = await autoAssignTx(tx, mosqueId, Number(row.id), year);
      if (outcome?.kind === "assigned") assigned += 1;
      else if (outcome?.kind === "waitlisted") waitlisted += 1;
    }
    return { assigned, waitlisted };
  });
}

// ————— الترقية من الانتظار عند شغور مقعد —————

/** يرقّي أوائل المنتظرين المطابقين لمقاعد حلقة شغرت (داخل ترانزاكشن قائمة). يرجع عدد المرقّين */
export async function promoteTx(tx: Tx, mosqueId: number, halaqahId: number, currentYear: number): Promise<number> {
  const slot = (await loadSlots(tx, mosqueId)).find((s) => s.id === halaqahId);
  if (!slot) return 0;
  const waiting = await tx.query(
    `SELECT id, name, birth_year, level, waitlist_order FROM mosque_registrations
     WHERE mosque_id = $1 AND status = 'waitlisted' ORDER BY waitlist_order, id FOR UPDATE`,
    [mosqueId],
  );
  const names = new Map(waiting.rows.map((row) => [Number(row.id), String(row.name)]));
  const entries = waiting.rows.map((row) => ({
    id: Number(row.id),
    order: Number(row.waitlist_order ?? 0),
    registrant: registrantOf(row),
  }));

  const promotions = selectPromotions(slot, entries, currentYear);
  for (const entry of promotions) {
    const name = names.get(entry.id) ?? "";
    const studentId = await insertStudentTx(tx, halaqahId, name);
    await tx.query(
      `UPDATE mosque_registrations
       SET status = 'assigned', halaqah_id = $1, student_id = $2, assigned_at = now(),
           waitlist_order = NULL, waitlisted_at = NULL
       WHERE id = $3 AND mosque_id = $4`,
      [halaqahId, studentId, entry.id, mosqueId],
    );
    await logActivity(tx, mosqueId, "promoted", entry.id, halaqahId, `شغر مقعد بحلقة «${slot.name}» فرُقّي «${name}» من قائمة الانتظار`);
  }
  return promotions.length;
}

/**
 * يُستدعى بعد أي حدث يُفرِّغ مقعداً (حذف طالب، إيقافه، رفع السعة). الميزة معطّلة
 * أو الحلقة بلا جامع = لا شيء. الاستدعاء يجب أن يلفّه try/catch: فشله لا يُفشل الحدث الأصلي.
 */
export async function onSeatFreed(halaqahId: number): Promise<number> {
  const rows = await db().sql`SELECT mosque_id FROM halaqahs WHERE id = ${halaqahId}`;
  const mosqueId = rows[0]?.mosque_id;
  if (typeof mosqueId !== "number") return 0;
  if (!(await isFeatureEnabled(mosqueId, AUTO_ASSIGN_KEY))) return 0;
  return withMosqueTx(mosqueId, (tx) => promoteTx(tx, mosqueId, halaqahId, new Date().getFullYear()));
}

// ————— لوحة الإدارة —————

export type OverviewHalaqah = HalaqahSlot & { teacherName: string };
export type WaitlistItem = {
  id: number;
  name: string;
  phone: string;
  birthYear: number | null;
  level: Level | null;
  position: number;
  waitlistedAt: string | null;
};
export type ActivityItem = { id: number; kind: string; message: string; createdAt: string; read: boolean };
export type EnrollmentOverview = {
  halaqahs: OverviewHalaqah[];
  waitlist: WaitlistItem[];
  activity: ActivityItem[];
  unread: number;
};

export async function getEnrollmentOverview(mosqueId: number): Promise<EnrollmentOverview> {
  const [halaqahRows, waitRows, activityRows] = await Promise.all([
    db().sql`
      SELECT h.id, h.name, h.capacity, h.min_age, h.max_age, h.level,
             (SELECT count(*)::int FROM students s
               WHERE s.teacher_id = h.id AND s.deleted_at IS NULL AND s.active) AS cnt,
             COALESCE((
               SELECT string_agg(t.teacher_name, '، ' ORDER BY (t.role = 'supervisor') DESC)
               FROM teachers t WHERE t.halaqah_id = h.id AND t.teacher_name != ''
             ), '') AS teacher_names
      FROM halaqahs h WHERE h.mosque_id = ${mosqueId} ORDER BY h.name
    `,
    db().sql`
      SELECT id, name, phone, birth_year, level, waitlisted_at
      FROM mosque_registrations
      WHERE mosque_id = ${mosqueId} AND status = 'waitlisted'
      ORDER BY waitlist_order, id
    `,
    db().sql`
      SELECT id, kind, message, created_at, read_at
      FROM enrollment_activity WHERE mosque_id = ${mosqueId}
      ORDER BY created_at DESC, id DESC LIMIT 30
    `,
  ]);
  const unreadRows = await db().sql`
    SELECT count(*)::int AS n FROM enrollment_activity WHERE mosque_id = ${mosqueId} AND read_at IS NULL
  `;
  return {
    halaqahs: halaqahRows.map((row) => ({ ...rowToSlot(row), teacherName: String(row.teacher_names ?? "") })),
    waitlist: waitRows.map((row, index) => ({
      id: Number(row.id),
      name: String(row.name),
      phone: String(row.phone ?? ""),
      birthYear: row.birth_year === null ? null : Number(row.birth_year),
      level: isLevel(row.level) ? row.level : null,
      position: index + 1,
      waitlistedAt: (row.waitlisted_at as string | null) ?? null,
    })),
    activity: activityRows.map((row) => ({
      id: Number(row.id),
      kind: String(row.kind),
      message: String(row.message),
      createdAt: row.created_at as string,
      read: row.read_at !== null,
    })),
    unread: Number(unreadRows[0]?.n ?? 0),
  };
}

export async function markActivityRead(mosqueId: number): Promise<void> {
  await db().sql`UPDATE enrollment_activity SET read_at = now() WHERE mosque_id = ${mosqueId} AND read_at IS NULL`;
}

/** يحدّث سعة حلقة ومعاييرها (للجامع نفسه فقط) ثم يرقّي المنتظرين إن اتّسعت. null = الحلقة ليست من الجامع */
export async function updateHalaqahCriteria(
  mosqueId: number,
  halaqahId: number,
  criteria: CriteriaInput,
): Promise<{ promoted: number } | null> {
  return withMosqueTx(mosqueId, async (tx) => {
    const updated = await tx.query(
      `UPDATE halaqahs SET capacity = $1, min_age = $2, max_age = $3, level = $4
       WHERE id = $5 AND mosque_id = $6 RETURNING id`,
      [criteria.capacity, criteria.minAge, criteria.maxAge, criteria.level, halaqahId, mosqueId],
    );
    if (updated.rows.length === 0) return null;
    const promoted = (await isFeatureEnabled(mosqueId, AUTO_ASSIGN_KEY))
      ? await promoteTx(tx, mosqueId, halaqahId, new Date().getFullYear())
      : 0;
    return { promoted };
  });
}

export type WaitlistMoveResult = "moved" | "not_found" | "edge";

/** يحرّك منتظراً خطوة بالقائمة (يعيد ترقيم الكل 1..n بالترتيب الجديد) */
export async function moveWaitlistEntry(mosqueId: number, registrationId: number, direction: "up" | "down"): Promise<WaitlistMoveResult> {
  return withMosqueTx(mosqueId, async (tx) => {
    const rows = await tx.query(
      "SELECT id FROM mosque_registrations WHERE mosque_id = $1 AND status = 'waitlisted' ORDER BY waitlist_order, id FOR UPDATE",
      [mosqueId],
    );
    const ids = rows.rows.map((row) => Number(row.id));
    if (!ids.includes(registrationId)) return "not_found";
    const next = moveInWaitlist(ids, registrationId, direction);
    if (!next) return "edge";
    for (let i = 0; i < next.length; i += 1) {
      await tx.query("UPDATE mosque_registrations SET waitlist_order = $1 WHERE id = $2 AND mosque_id = $3", [i + 1, next[i], mosqueId]);
    }
    return "moved";
  });
}

/** يزيل منتظراً (حذف ناعم status='removed' — لا يُحذف الصف) */
export async function removeWaitlistEntry(mosqueId: number, registrationId: number): Promise<boolean> {
  return withMosqueTx(mosqueId, async (tx) => {
    const result = await tx.query(
      `UPDATE mosque_registrations SET status = 'removed', waitlist_order = NULL
       WHERE id = $1 AND mosque_id = $2 AND status = 'waitlisted' RETURNING name`,
      [registrationId, mosqueId],
    );
    if (result.rows.length === 0) return false;
    await logActivity(tx, mosqueId, "removed", registrationId, null, `أُزيل «${String(result.rows[0].name)}» من قائمة الانتظار`);
    return true;
  });
}

// ————— الاستيراد —————

export type ImportScope = { kind: "admin" } | { kind: "teacher"; halaqahId: number };

async function buildImportContext(tx: Tx, mosqueId: number, scope: ImportScope, currentYear: number): Promise<ImportContext> {
  const slots = await loadSlots(tx, mosqueId);
  const halaqat = (scope.kind === "admin" ? slots : slots.filter((s) => s.id === scope.halaqahId)).map((s) => ({
    id: s.id,
    name: s.name,
    capacity: s.capacity,
    count: s.count,
  }));
  const people = await tx.query(
    `SELECT s.name, COALESCE(p.phone, '') AS phone
       FROM students s
       JOIN halaqahs h ON h.id = s.teacher_id AND h.mosque_id = $1
       LEFT JOIN student_profiles p ON p.halaqah_id = s.teacher_id AND p.student_id = s.id
      WHERE s.deleted_at IS NULL
     UNION ALL
     SELECT name, phone FROM mosque_registrations WHERE mosque_id = $1 AND status <> 'removed'`,
    [mosqueId],
  );
  return {
    admin: scope.kind === "admin",
    currentYear,
    halaqat,
    teacherHalaqahId: scope.kind === "teacher" ? scope.halaqahId : null,
    existing: people.rows.map((row) => ({ name: String(row.name), phone: String(row.phone ?? "") })),
  };
}

export type ImportPreview = { rows: RowResult[]; summary: ImportSummary };

export async function previewImport(mosqueId: number, scope: ImportScope, rows: readonly RawRow[]): Promise<ImportPreview> {
  const client = await db().pool.connect();
  try {
    const ctx = await buildImportContext(client as unknown as Tx, mosqueId, scope, new Date().getFullYear());
    return validateRows(rows, ctx);
  } finally {
    client.release();
  }
}

export type ImportCommit = ImportPreview & { created: number; skipped: number; autoAssigned: number; waitlisted: number };

/** يعيد التحقق كاملاً داخل الترانزاكشن (بأعداد وتكرارات حيّة) ثم يُدرج الصفوف السليمة فقط */
export async function commitImport(mosqueId: number, scope: ImportScope, rows: readonly RawRow[]): Promise<ImportCommit> {
  const year = new Date().getFullYear();
  const autoAssign = scope.kind === "admin" && (await isFeatureEnabled(mosqueId, AUTO_ASSIGN_KEY)) && (await isFeatureEnabled(mosqueId, "halaqat"));

  return withMosqueTx(mosqueId, async (tx) => {
    const ctx = await buildImportContext(tx, mosqueId, scope, year);
    const validated = validateRows(rows, ctx);
    let created = 0;
    let autoAssigned = 0;
    let waitlisted = 0;

    for (const row of validated.rows) {
      if (row.status !== "ok") continue;
      if (row.halaqahId !== null) {
        const studentId = await insertStudentTx(tx, row.halaqahId, row.name);
        await tx.query(
          `INSERT INTO student_profiles (halaqah_id, student_id, phone, parent_phone, birth_year, notes)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.halaqahId, studentId, row.phone, row.parentPhone, row.birthYear, row.notes],
        );
      } else {
        const inserted = await tx.query(
          "INSERT INTO mosque_registrations (mosque_id, name, phone, birth_year) VALUES ($1, $2, $3, $4) RETURNING id",
          [mosqueId, row.name, row.phone, row.birthYear],
        );
        if (autoAssign) {
          const outcome = await autoAssignTx(tx, mosqueId, Number(inserted.rows[0].id), year);
          if (outcome?.kind === "assigned") autoAssigned += 1;
          else if (outcome?.kind === "waitlisted") waitlisted += 1;
        }
      }
      created += 1;
    }

    return {
      ...validated,
      created,
      skipped: validated.rows.length - created,
      autoAssigned,
      waitlisted,
    };
  });
}

/** الجامع الذي تنتمي إليه حلقة المعلّم إن كان الاستيراد مفعّلاً له، وإلا null */
export async function importMosqueForHalaqah(halaqahId: number): Promise<number | null> {
  const rows = await db().sql`SELECT mosque_id FROM halaqahs WHERE id = ${halaqahId}`;
  const mosqueId = rows[0]?.mosque_id;
  if (typeof mosqueId !== "number") return null;
  return (await isFeatureEnabled(mosqueId, IMPORT_KEY)) ? mosqueId : null;
}
